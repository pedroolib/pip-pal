// Records the chosen source into memory as 16 kHz mono PCM for `api.transcribe`. Nothing is ever
// written anywhere; every track is stopped and the context closed on stop, cancel and error.
import { RECORD_SAMPLE_RATE, type RecordSource } from '@shared/schemas'
import { isCantHear } from './model'

/** Computer audio was refused or arrived ended (macOS without the permission fails this way). */
export class CantHearError extends Error {}

export interface Recording {
  /** Stops and returns what was heard as 16 kHz mono; the recorder keeps no copy. */
  stop(): Promise<Float32Array>
  cancel(): void
}

// How long computer audio alone gets to deliver its first frames.
const CHECK_MS = 2000

/** Starts recording `source`; `onCantHear` fires if computer audio alone ends or never arrives. */
export async function startRecording(
  source: RecordSource,
  onCantHear: () => void
): Promise<Recording> {
  const streams: MediaStream[] = []
  let ctx: AudioContext | null = null
  let check: ReturnType<typeof setTimeout> | undefined
  const end = (): void => {
    clearTimeout(check)
    streams.forEach((s) => s.getAudioTracks().forEach((t) => (t.onended = null)))
    streams.forEach((s) => s.getTracks().forEach((t) => t.stop()))
    ctx?.close().catch(() => {})
  }
  try {
    // Computer audio first: the browser only allows getDisplayMedia right after the click.
    let system: MediaStream | null = null
    if (source !== 'mic') {
      // Main grants a screen plus loopback audio; only the audio is wanted.
      system = await navigator.mediaDevices
        .getDisplayMedia({ video: true, audio: true })
        .catch((e) => {
          throw isCantHear(e) ? new CantHearError() : e
        })
      streams.push(system)
      for (const t of system.getVideoTracks()) {
        t.stop()
        system.removeTrack(t)
      }
      const track = system.getAudioTracks()[0]
      if (!track || track.readyState === 'ended') throw new CantHearError()
    }
    if (source !== 'system')
      streams.push(await navigator.mediaDevices.getUserMedia({ audio: true }))

    const audio = new AudioContext()
    ctx = audio
    const chunks: Float32Array[] = []
    // shortcut: ScriptProcessorNode is deprecated but needs no worklet file; move to AudioWorklet if Chromium drops it.
    // One input channel: the sources are summed and downmixed to mono here.
    const tap = audio.createScriptProcessor(4096, 1, 1)
    tap.onaudioprocess = (e) => chunks.push(e.inputBuffer.getChannelData(0).slice())
    for (const s of streams) audio.createMediaStreamSource(s).connect(tap)
    tap.connect(audio.destination) // its output stays silent; this only keeps it running

    // Computer audio alone: a track that ends, or no frames at all, means nothing to record. Zeros are
    // only quiet (nothing playing yet), and with Both the mic still counts, so neither aborts.
    if (source === 'system' && system) {
      const track = system.getAudioTracks()[0]
      track.onended = onCantHear
      check = setTimeout(() => {
        if (track.readyState === 'ended' || chunks.length === 0) onCantHear()
      }, CHECK_MS)
    }

    return {
      async stop() {
        tap.onaudioprocess = null
        end()
        const rate = audio.sampleRate
        const length = chunks.reduce((n, c) => n + c.length, 0)
        if (length === 0) return new Float32Array(0)
        const out = new OfflineAudioContext(
          1,
          Math.ceil((length * RECORD_SAMPLE_RATE) / rate),
          RECORD_SAMPLE_RATE
        )
        const buffer = out.createBuffer(1, length, rate)
        const data = buffer.getChannelData(0)
        let at = 0
        for (const c of chunks) {
          data.set(c, at)
          at += c.length
        }
        chunks.length = 0
        const node = out.createBufferSource()
        node.buffer = buffer
        node.connect(out.destination)
        node.start()
        return (await out.startRendering()).getChannelData(0)
      },
      cancel() {
        tap.onaudioprocess = null
        chunks.length = 0
        end()
      }
    }
  } catch (e) {
    end()
    throw e
  }
}

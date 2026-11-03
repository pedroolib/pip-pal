// Records the chosen source into memory as 16 kHz mono PCM for `api.transcribe`. Nothing is ever
// written anywhere; every track is stopped and the context closed on stop, cancel and error.
import { RECORD_SAMPLE_RATE, type RecordSource } from '@shared/schemas'

/** The computer audio track arrived ended (macOS without the permission fails this way). */
export class CantHearError extends Error {}

export interface Recording {
  /** Stops and returns what was heard as 16 kHz mono; the recorder keeps no copy. */
  stop(): Promise<Float32Array>
  cancel(): void
}

// Computer audio that stays all zeros this long is a missing permission or nothing playing.
const SILENCE_MS = 2000

/** Starts recording `source`; `onCantHear` fires if the computer audio stays silent. */
export async function startRecording(
  source: RecordSource,
  onCantHear: () => void
): Promise<Recording> {
  const streams: MediaStream[] = []
  let ctx: AudioContext | null = null
  let silence: ReturnType<typeof setInterval> | undefined
  const end = (): void => {
    clearInterval(silence)
    streams.forEach((s) => s.getTracks().forEach((t) => t.stop()))
    ctx?.close().catch(() => {})
  }
  try {
    // Computer audio first: the browser only allows getDisplayMedia right after the click.
    let system: MediaStream | null = null
    if (source !== 'mic') {
      // Main grants a screen plus loopback audio; only the audio is wanted.
      system = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
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

    if (system) {
      const probe = audio.createAnalyser()
      audio.createMediaStreamSource(system).connect(probe)
      const samples = new Float32Array(probe.fftSize)
      const since = Date.now()
      silence = setInterval(() => {
        probe.getFloatTimeDomainData(samples)
        if (samples.some((v) => v !== 0)) clearInterval(silence)
        else if (Date.now() - since > SILENCE_MS) {
          clearInterval(silence)
          onCantHear()
        }
      }, 100)
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

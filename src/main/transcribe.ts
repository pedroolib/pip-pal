// Speech to text on this machine (Whisper through transformers.js); the audio never leaves it.
import { existsSync } from 'fs'
import { join } from 'path'
import transcriptJson from '@shared/fixtures/demo.transcript.json'
import {
  RECORD_MAX_MS,
  RECORD_SAMPLE_RATE,
  TRANSCRIBE_TIMEOUT_MS,
  type Settings
} from '@shared/schemas'

export const WHISPER_MODEL = 'Xenova/whisper-base'
/** The files scripts/fetch-whisper.mjs downloads, relative to the model's folder. */
export const WHISPER_FILES = [
  'config.json',
  'generation_config.json',
  'preprocessor_config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/encoder_model_quantized.onnx',
  'onnx/decoder_model_merged_quantized.onnx'
]
const MAX_SAMPLES = RECORD_SAMPLE_RATE * (RECORD_MAX_MS / 1000 + 5)

type Language = Settings['language']
type Asr = (audio: Float32Array, language: Language) => Promise<string>

export interface Transcriber {
  /** Loads the model ahead of the first recording. Never rejects; transcribe reports the failure. */
  warmUp(): Promise<void>
  transcribe(audio: unknown): Promise<string>
}

async function loadWhisper(modelDir: string): Promise<Asr> {
  if (!WHISPER_FILES.every((f) => existsSync(join(modelDir, WHISPER_MODEL, f))))
    throw new Error("The speech model isn't installed. Run npm run fetch:whisper.")
  const { env, pipeline } = await import('@huggingface/transformers')
  env.allowRemoteModels = false
  env.localModelPath = modelDir
  const asr = await pipeline('automatic-speech-recognition', WHISPER_MODEL, { dtype: 'q8' })
  return async (audio, language) => {
    // shortcut: transformers.js has no language detection (it assumes English), so Pip's own language is used; detect it once the library can.
    const out = await asr(audio, { chunk_length_s: 30, stride_length_s: 5, language })
    return (Array.isArray(out) ? out[0] : out).text
  }
}

// IPC hands us whatever the renderer sent: check it before it reaches the model.
function checkAudio(audio: unknown): Float32Array {
  if (!(audio instanceof Float32Array)) throw new Error('Audio must be a Float32Array.')
  if (audio.length === 0) throw new Error('The recording is empty.')
  if (audio.length > MAX_SAMPLES) throw new Error('The recording is too long.')
  if (!audio.every(Number.isFinite)) throw new Error('The recording has invalid samples.')
  return audio
}

function timeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Transcription timed out.')), ms)
  })
  return Promise.race([p, late]).finally(() => clearTimeout(timer))
}

export function createTranscriber({
  demo,
  modelDir,
  language = () => 'en',
  load = loadWhisper
}: {
  demo: boolean
  modelDir: string
  /** Read on every call, so a settings change applies to the next recording. */
  language?: () => Language
  load?: (modelDir: string) => Promise<Asr>
}): Transcriber {
  let loading: Promise<Asr> | null = null
  // One shared load; a failed one is forgotten so the next call tries again.
  const model = (): Promise<Asr> =>
    (loading ??= Promise.resolve()
      .then(() => load(modelDir))
      .catch((e) => {
        loading = null
        throw e
      }))

  const run = async (audio: Float32Array): Promise<string> => {
    // Whisper writes sounds as [BEEP] or (upbeat music); those are not words.
    const raw = await (await model())(audio, language())
    const text = raw
      .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (!text) throw new Error("I didn't hear any words.")
    return text
  }

  return {
    async warmUp() {
      const started = Date.now()
      try {
        await model()
        console.log(`Speech model ready in ${Date.now() - started} ms.`)
      } catch {
        console.log('Speech model could not load; transcribe will report why.')
      }
    },
    async transcribe(input) {
      const audio = checkAudio(input)
      const started = Date.now()
      try {
        const text = await (demo ? timeout(run(audio), TRANSCRIBE_TIMEOUT_MS) : run(audio))
        // Lengths and timings only: the transcript itself is never logged.
        console.log(`Transcribed ${audio.length} samples in ${Date.now() - started} ms.`)
        return text
      } catch (e) {
        if (!demo) throw e
        console.log('Transcription failed or timed out: demo uses the scripted transcript.')
        return transcriptJson.text
      }
    }
  }
}

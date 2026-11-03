import { afterEach, describe, expect, it, vi } from 'vitest'
import transcriptJson from '@shared/fixtures/demo.transcript.json'
import { RECORD_MAX_MS, RECORD_SAMPLE_RATE, TRANSCRIBE_TIMEOUT_MS } from '@shared/schemas'
import { createTranscriber, type Transcriber } from './transcribe'

const second = new Float32Array(RECORD_SAMPLE_RATE)
const make = (
  demo: boolean,
  asr: (a: Float32Array) => Promise<string>
): { load: ReturnType<typeof vi.fn>; t: Transcriber } => {
  const load = vi.fn(async () => asr)
  return { load, t: createTranscriber({ demo, modelDir: 'unused', load }) }
}

afterEach(() => vi.useRealTimers())

describe('transcriber', () => {
  const bad: [string, unknown][] = [
    ['not a Float32Array', [0, 0, 0]],
    ['a Float64Array', new Float64Array(10)],
    ['empty', new Float32Array(0)],
    ['too long', new Float32Array(RECORD_SAMPLE_RATE * (RECORD_MAX_MS / 1000 + 5) + 1)],
    ['NaN samples', Float32Array.of(0, NaN, 0)],
    ['infinite samples', Float32Array.of(0, Infinity)]
  ]
  for (const demo of [false, true]) {
    it.each(bad)(`rejects audio that is %s (demo=${demo})`, async (_, audio) => {
      const { t, load } = make(demo, async () => 'hello')
      await expect(t.transcribe(audio)).rejects.toThrow(Error)
      expect(load).not.toHaveBeenCalled()
    })
  }

  it('accepts the longest allowed recording', async () => {
    const { t } = make(false, async () => 'ok')
    const longest = new Float32Array(RECORD_SAMPLE_RATE * (RECORD_MAX_MS / 1000 + 5))
    await expect(t.transcribe(longest)).resolves.toBe('ok')
  })

  it('returns the trimmed text', async () => {
    const { t } = make(false, async () => '  Send the numbers to Dana.\n')
    await expect(t.transcribe(second)).resolves.toBe('Send the numbers to Dana.')
  })

  it('rejects calmly when no words were heard', async () => {
    const { t } = make(false, async () => '   ')
    await expect(t.transcribe(second)).rejects.toThrow("I didn't hear any words.")
  })

  it('drops sound tags like [BEEP] and (upbeat music), so a tone counts as no words', async () => {
    const { t } = make(false, async () => ' (upbeat music) [Music] ')
    await expect(t.transcribe(second)).rejects.toThrow("I didn't hear any words.")
    const { t: t2 } = make(false, async () => '[BLANK_AUDIO] Send it to Dana. [BEEP]')
    await expect(t2.transcribe(second)).resolves.toBe('Send it to Dana.')
  })

  it("transcribes in Pip's current language", async () => {
    let language = 'en'
    const asr = vi.fn(async () => 'hola')
    const t = createTranscriber({
      demo: false,
      modelDir: 'unused',
      language: () => language as 'en' | 'es',
      load: async () => asr
    })
    await t.transcribe(second)
    language = 'es'
    await t.transcribe(second)
    expect(asr.mock.calls.map((c) => (c as unknown[])[1])).toEqual(['en', 'es'])
  })

  it('loads the model once for warm-up and every transcription', async () => {
    const { t, load } = make(false, async () => 'hi')
    await Promise.all([t.warmUp(), t.warmUp(), t.transcribe(second)])
    await t.transcribe(second)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('retries a failed load on the next call', async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('disk hiccup'))
      .mockResolvedValue(async () => 'second try')
    const t = createTranscriber({ demo: false, modelDir: 'unused', load })
    await expect(t.transcribe(second)).rejects.toThrow('disk hiccup')
    await expect(t.transcribe(second)).resolves.toBe('second try')
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('warm-up never rejects, so a launch-time failure stays quiet', async () => {
    const load = vi.fn().mockRejectedValue(new Error('no model'))
    const t = createTranscriber({ demo: false, modelDir: 'unused', load })
    await expect(t.warmUp()).resolves.toBeUndefined()
  })

  it('says how to install the model when its files are missing', async () => {
    const t = createTranscriber({ demo: false, modelDir: 'C:/definitely/not/here' })
    await expect(t.transcribe(second)).rejects.toThrow(
      "The speech model isn't installed. Run npm run fetch:whisper."
    )
  })

  it('falls back to the scripted transcript in demo when transcription fails', async () => {
    const { t } = make(true, async () => {
      throw new Error('onnx exploded')
    })
    await expect(t.transcribe(second)).resolves.toBe(transcriptJson.text)
  })

  it('falls back to the scripted transcript in demo when no words were heard', async () => {
    const { t } = make(true, async () => '')
    await expect(t.transcribe(second)).resolves.toBe(transcriptJson.text)
  })

  it('falls back to the scripted transcript in demo after the timeout', async () => {
    vi.useFakeTimers()
    const { t } = make(true, () => new Promise(() => {}))
    const result = t.transcribe(second)
    await vi.advanceTimersByTimeAsync(TRANSCRIBE_TIMEOUT_MS)
    await expect(result).resolves.toBe(transcriptJson.text)
  })

  it('rejects a second recording while one is still transcribing, then accepts the next', async () => {
    const finish: ((text: string) => void)[] = []
    const { t } = make(false, () => new Promise((r) => finish.push(r)))
    const first = t.transcribe(second)
    await expect(t.transcribe(second)).rejects.toThrow('Pip is still transcribing')
    await vi.waitFor(() => expect(finish).toHaveLength(1))
    finish[0]('first done')
    await expect(first).resolves.toBe('first done')
    const next = t.transcribe(second)
    await vi.waitFor(() => expect(finish).toHaveLength(2))
    finish[1]('next')
    await expect(next).resolves.toBe('next')
  })

  it('accepts a new recording after a failed one', async () => {
    const asr = vi.fn().mockRejectedValueOnce(new Error('onnx exploded')).mockResolvedValue('ok')
    const t = createTranscriber({ demo: false, modelDir: 'unused', load: async () => asr })
    await expect(t.transcribe(second)).rejects.toThrow('onnx exploded')
    await expect(t.transcribe(second)).resolves.toBe('ok')
  })

  it('in demo, stays busy after the timeout until the model really finishes', async () => {
    vi.useFakeTimers()
    let finish: (text: string) => void = () => {}
    const { t } = make(true, () => new Promise((r) => (finish = r)))
    const result = t.transcribe(second)
    await vi.advanceTimersByTimeAsync(TRANSCRIBE_TIMEOUT_MS)
    await expect(result).resolves.toBe(transcriptJson.text)
    await expect(t.transcribe(second)).rejects.toThrow('Pip is still transcribing')
    finish('late')
    await vi.advanceTimersByTimeAsync(0)
    // Accepted again: it falls back to the script instead of rejecting as busy.
    const next = t.transcribe(second)
    await vi.advanceTimersByTimeAsync(TRANSCRIBE_TIMEOUT_MS)
    await expect(next).resolves.toBe(transcriptJson.text)
  })

  it('does not time out outside demo', async () => {
    vi.useFakeTimers()
    let finish: (text: string) => void = () => {}
    const { t } = make(false, () => new Promise((r) => (finish = r)))
    const result = t.transcribe(second)
    await vi.advanceTimersByTimeAsync(TRANSCRIBE_TIMEOUT_MS * 2)
    finish('late but real')
    await expect(result).resolves.toBe('late but real')
  })
})

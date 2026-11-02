import { afterEach, describe, expect, it, vi } from 'vitest'
import samJson from '@shared/fixtures/sam.profile.json'
import { Profile, type Classification, type DecodeResult } from '@shared/schemas'
import { createDecoder, type ClaudeClient, type JevClient } from './decoder'

const profile = Profile.parse(samJson) // owner Sam; people Alex (Manager), Dana, Rui

const decode: DecodeResult = {
  summary: '[Manager] is moving you to a new project.',
  asks: ['Read the brief'],
  deadline: null,
  implicitExpectations: [{ expectation: 'Be ready Monday', why: '[Manager] said "from Monday"' }],
  steps: [{ text: 'Ask [Manager] for the brief', why: 'You prefer written instructions' }],
  change: {
    type: 'project',
    transitionPlan: ['Finish current task'],
    questionsToAsk: ['Who owns it?']
  },
  uncertainties: [],
  profileUsed: [{ section: 'communication', how: 'Prefers written instructions' }]
}
const claudeClassification = {
  isChange: 0.7,
  changeType: 'project',
  tone: 'neutral',
  urgency: 3,
  isAmbiguous: 0.4
} as const
const jevClassification: Omit<Classification, 'source'> = {
  isChange: 0.93,
  changeType: 'priorities',
  tone: 'urgent',
  urgency: 4,
  isAmbiguous: 0.12
}

// Fakes record every string they are handed, so tests can prove what would leave the machine.
function fakes(
  opts: { claude?: unknown[]; jev?: () => Promise<Omit<Classification, 'source'>> } = {}
): { claude: ClaudeClient; jev: JevClient; sent: string[]; calls: () => number } {
  const sent: string[] = []
  const answers = opts.claude ?? [{ classification: claudeClassification, decode }]
  let i = 0
  const claude: ClaudeClient = {
    decode: async (req) => {
      sent.push(req.system, req.user)
      return answers[Math.min(i++, answers.length - 1)]
    }
  }
  const jev: JevClient = {
    classify: async (text) => {
      sent.push(text)
      return (opts.jev ?? (async () => jevClassification))()
    }
  }
  return { claude, jev, sent, calls: () => i }
}

afterEach(() => vi.useRealTimers())

describe('createDecoder', () => {
  it('merges Jev classification with Claude decode and restores names', async () => {
    const f = fakes()
    const out = await createDecoder(f)('Alex: new project from Monday.', 3, profile)
    expect(out.fromCache).toBe(false)
    expect(out.classification).toEqual({ ...jevClassification, source: 'jev' })
    expect(out.decode.summary).toBe('Alex is moving you to a new project.')
    expect(out.decode.steps[0].text).toBe('Ask Alex for the brief')
  })

  it('sends no name, email, phone or URL to Claude or Jev', async () => {
    const f = fakes()
    const message =
      'Hi SAM, alex here. Dana and Rui moved to Atlas, cc dana.lopez@acme.com. ' +
      'Call +52 55 1234-5678 or see https://acme.com/wiki?page=atlas and www.acme.io/plan.'
    await createDecoder(f)(message, 2, profile)
    expect(f.sent.length).toBeGreaterThanOrEqual(3)
    const secrets = [
      /\bsam\b/i,
      /\balex\b/i,
      /\bdana\b/i,
      /\brui\b/i,
      /@/,
      /1234/,
      /acme/i,
      /https?:/,
      /www\./
    ]
    for (const s of f.sent) for (const secret of secrets) expect(s).not.toMatch(secret)
  })

  it('falls back to Claude when Jev fails', async () => {
    const f = fakes({ jev: () => Promise.reject(new Error('down')) })
    const out = await createDecoder(f)('New project from Monday.', 3, profile)
    expect(out.classification).toEqual({ ...claudeClassification, source: 'claude' })
  })

  it('falls back to Claude when Jev takes longer than 3 s', async () => {
    vi.useFakeTimers()
    const f = fakes({ jev: () => new Promise(() => {}) })
    const pending = createDecoder(f)('New project from Monday.', 3, profile)
    await vi.advanceTimersByTimeAsync(3000)
    expect((await pending).classification.source).toBe('claude')
  })

  it('uses Claude classification when there is no Jev client', async () => {
    const f = fakes()
    const out = await createDecoder({ claude: f.claude, jev: null })('Hi.', null, profile)
    expect(out.classification.source).toBe('claude')
  })

  it('retries once on invalid output, with the validation error', async () => {
    const f = fakes({ claude: [{ nope: true }, { classification: claudeClassification, decode }] })
    const out = await createDecoder(f)('New project.', 3, profile)
    expect(f.calls()).toBe(2)
    expect(out.decode.change?.type).toBe('project')
    expect(f.sent.at(-1)).toMatch(/did not match the tool schema/)
  })

  it('rejects after a second invalid output', async () => {
    const f = fakes({ claude: [{ nope: true }] })
    await expect(createDecoder(f)('New project.', 3, profile)).rejects.toThrow(/invalid/)
    expect(f.calls()).toBe(2)
  })

  it.each([
    ['empty', '   \n '],
    ['over 8000 chars', 'a'.repeat(8001)]
  ])('rejects %s text before any client call', async (_, text) => {
    const f = fakes()
    await expect(createDecoder(f)(text, 3, profile)).rejects.toThrow()
    expect(f.sent).toEqual([])
  })
})

describe('API keys stay in main', () => {
  it('no renderer, preload or shared file uses the SDKs or the keys', async () => {
    const { readdirSync, readFileSync } = await import('fs')
    const { join } = await import('path')
    const files = ['src/renderer', 'src/preload', 'src/shared'].flatMap((dir) =>
      readdirSync(dir, { recursive: true, encoding: 'utf8' })
        .filter((f) => /\.(ts|tsx|js|jsx)$/.test(f))
        .map((f) => join(dir, f))
    )
    expect(files.length).toBeGreaterThan(0)
    for (const f of files)
      expect(readFileSync(f, 'utf8')).not.toMatch(
        /@anthropic-ai\/sdk|@typesafe-ai\/sdk|ANTHROPIC_API_KEY|TYPESAFE_API_KEY/
      )
  })
})

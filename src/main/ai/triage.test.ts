import { afterEach, describe, expect, it, vi } from 'vitest'
import samJson from '@shared/fixtures/sam.profile.json'
import { Profile } from '@shared/schemas'
import { JEV_TIMEOUT_MS } from './decoder'
import { createTriager, splitSentences, type TriageJevClient } from './triage'
import { MAX_CANDIDATES } from './triage-questions'

const sam = Profile.parse(samJson) // owner Sam; people Alex (Manager), Dana, Rui
const profile: Profile = {
  ...sam,
  name: 'Sam Rivera',
  people: [
    { name: 'Alex Morgan', role: 'Manager' },
    { name: 'Dana López', role: 'Teammate on the forecasting project' },
    { name: 'Rui', role: 'Buddy' }
  ]
}
const now = (): Date => new Date(2026, 10, 1, 9, 0) // Sun 1 Nov 2026

const DEMO =
  "Hey Sam, heads up, we're moving you to the Q1 forecasting project starting Monday. Can you wrap up the dashboard stuff and sync with Dana when you get a chance? Thx"

type Questions = Record<string, { type: string; criteria?: Record<string, unknown> }>
type Answers = Record<string, unknown>

// Settled defaults: every Choice puts 0.9 on the named option (or the first), every Noul is a clear no.
function answer(questions: Questions, over: Answers = {}): Answers {
  const out: Answers = {}
  for (const [k, q] of Object.entries(questions)) {
    if (q.type === 'noul') out[k] = { noul: 0.05 }
    else {
      const labels = Object.keys(q.criteria ?? {})
      const probabilities = Object.fromEntries(
        labels.map((l, i) => [
          l,
          labels.length === 1 ? 1 : i === 0 ? 0.9 : 0.1 / (labels.length - 1)
        ])
      )
      out[k] = { choice: labels[0], probabilities }
    }
  }
  return { ...out, ...over }
}
const sure = (label: string, others: string[], p = 0.9): unknown => ({
  choice: label,
  probabilities: Object.fromEntries([
    [label, p],
    ...others.map((o) => [o, (1 - p) / others.length])
  ])
})

// The fake records every string it is handed, so tests can prove what would leave the machine.
function fake(over: (q: Questions) => Answers = () => ({})): {
  jev: TriageJevClient
  sent: string[]
  questions: () => Questions
} {
  const sent: string[] = []
  let last: Questions = {}
  const walk = (v: unknown): void => {
    if (typeof v === 'string') sent.push(v)
    else if (v && typeof v === 'object')
      for (const [k, x] of Object.entries(v)) {
        sent.push(k)
        walk(x)
      }
  }
  return {
    sent,
    questions: () => last,
    jev: {
      ask: async (req) => {
        walk(req)
        last = req.questions as Questions
        return answer(last, over(last))
      }
    }
  }
}

afterEach(() => vi.useRealTimers())

describe('createTriager', () => {
  it('maps a settled answer to Triage fields, with deadline, evidence and names restored', async () => {
    const f = fake((q) => ({
      type: sure('change_announcement', [
        'task_request',
        'question',
        'information_only',
        'feedback',
        'social'
      ]),
      isChange: { noul: 0.95 },
      isNewTask: { noul: 0.8 },
      changeType: { choice: 'project' },
      hasDeadline: { noul: 0.9 },
      deadline: { choice: 'Monday', probabilities: { Monday: 1 } },
      evidenceDeadline: { choice: Object.keys(q.evidenceDeadline.criteria!)[0] },
      evidenceTone: {
        choice:
          'Can you wrap up the dashboard stuff and sync with [Teammate on the forecasting project] when you get a chance?'
      },
      evidenceChange: { choice: Object.keys(q.evidenceChange.criteria!)[0] }
    }))
    const t = await createTriager({ jev: f.jev, now })(DEMO, profile)
    expect(t.source).toBe('jev')
    expect(t.type).toEqual({ value: 'change', p: 0.9 })
    expect(t.changeType).toBe('project')
    expect(t.deadline).toEqual({ text: 'Monday', date: '2026-11-02', explicit: false })
    expect(t.evidence.deadline).toBe(
      "Hey Sam Rivera, heads up, we're moving you to the Q1 forecasting project starting Monday."
    )
    expect(t.evidence.tone).toBe(
      'Can you wrap up the dashboard stuff and sync with Dana López when you get a chance?'
    )
    expect(t.senderRole).toBeNull()
    expect(t.unsure).toEqual([])
    expect(t.actions).toEqual([
      { kind: 'transition', strength: 'primary' },
      { kind: 'steps', strength: 'primary' }
    ])
  })

  it('sends no name, email, phone or URL to Jev, and every candidate comes from the scrubbed text', async () => {
    const f = fake()
    const message =
      'Alex Morgan: Hi SAM, Dana López and Rui moved to Atlas starting Monday, cc dana.lopez@acme.com.\n' +
      'Call +52 55 1234-5678 or see https://acme.com/wiki?page=atlas and www.acme.io/plan by 2026-11-05 14:30.\n' +
      'Thanks, Alex'
    await createTriager({ jev: f.jev, now })(message, profile)
    const secrets = [
      /\bsam\b/i,
      /rivera/i,
      /\balex\b/i,
      /morgan/i,
      /\bdana\b/i,
      /l[oó]pez/i,
      /\brui\b/i,
      /@acme/i,
      /1234/,
      /https?:/i,
      /www\./i,
      /acme\.(?:com|io)/i
    ]
    for (const s of f.sent) for (const re of secrets) expect(s).not.toMatch(re)
    const scrubbed = (f.sent.find((s) => s.includes('Atlas')) ?? '').trim()
    expect(scrubbed).toContain('[Manager]: Hi [Me]')
    const q = f.questions()
    const candidates = [
      ...Object.keys(q.deadline.criteria!),
      ...Object.keys(q.evidenceTone.criteria!)
    ]
    expect(candidates).toContain('2026-11-05 14:30')
    for (const c of candidates) expect(scrubbed).toContain(c)
  })

  it('reads the sender role from a sender marker naming someone in the profile', async () => {
    const role = async (text: string): Promise<string | null> =>
      (await createTriager({ jev: fake().jev, now })(text, profile)).senderRole
    expect(await role('alex: can you send the report?')).toBe('Manager')
    expect(await role('From: Dana López\nThe numbers are in.')).toBe(
      'Teammate on the forecasting project'
    )
    expect(await role('The numbers are in.\n— Rui')).toBe('Buddy')
    expect(await role('Can you check it? Thanks, Dana')).toBe('Teammate on the forecasting project')
    expect(await role('Ask Alex about it.')).toBeNull()
    expect(await role('Kim: can you send the report?')).toBeNull()
    expect(await role('Thanks, Sam')).toBeNull() // the owner is not a sender in people
    // A typed shortened token never pins the message on a real colleague.
    expect(await role('The numbers are in. Thanks, [Teammate]')).toBeNull()
    // Nor does a fullwidth or zero-width variant, even when Dana is mentioned.
    expect(await role('Dana sent the numbers. Thanks, ［Teammate］')).toBeNull()
    expect(await role('Dana sent the numbers. Thanks, [Team​mate]')).toBeNull()
  })

  it('applies the unsure bands at their edges', async () => {
    const run = async (over: Answers): Promise<string[]> =>
      (await createTriager({ jev: fake(() => over).jev, now })('Please send the file.', profile))
        .unsure
    expect(await run({ isNewTask: { noul: 0.3 } })).toEqual(['task'])
    expect(await run({ isNewTask: { noul: 0.29 } })).toEqual([])
    expect(await run({ isNewTask: { noul: 0.7 } })).toEqual([])
    expect(await run({ isChange: { noul: 0.69 } })).toEqual(['change'])
    expect(await run({ whoUnclear: { noul: 0.5 } })).toEqual(['ambiguity'])
    expect(await run({ hasDeadline: { noul: 0.4 } })).toEqual(['deadline'])
    const tone = (p: Record<string, number>): Answers => ({
      tone: { choice: 'neutral', probabilities: p }
    })
    // Top 0.6 leading by exactly 0.2 is sure; just under either limit is not.
    expect(await run(tone({ neutral: 0.6, friendly: 0.4, upset: 0, worried: 0 }))).toEqual([])
    expect(await run(tone({ neutral: 0.59, friendly: 0.21, upset: 0.2, worried: 0 }))).toEqual([
      'tone'
    ])
    expect(await run(tone({ neutral: 0.65, friendly: 0.35, upset: 0, worried: 0 }))).toEqual([])
    expect(await run(tone({ neutral: 0.7, friendly: 0.11, upset: 0, worried: 0.19 }))).toEqual([])
  })

  it('orders actions primary before maybe, then change, task, questions', async () => {
    const actions = async (over: Answers): Promise<unknown> =>
      (await createTriager({ jev: fake(() => over).jev, now })('Please send the file.', profile))
        .actions
    expect(
      await actions({
        isChange: { noul: 0.5 },
        isNewTask: { noul: 0.3 },
        whatUnclear: { noul: 0.5 }
      })
    ).toEqual([
      { kind: 'questions', strength: 'primary' },
      { kind: 'transition', strength: 'maybe' },
      { kind: 'steps', strength: 'maybe' }
    ])
    expect(
      await actions({
        isChange: { noul: 0.29 },
        isNewTask: { noul: 0.7 },
        deadlineUnclear: { noul: 0.49 }
      })
    ).toEqual([
      { kind: 'steps', strength: 'primary' },
      { kind: 'questions', strength: 'maybe' }
    ])
    expect(await actions({})).toEqual([])
  })

  it('maps a clear no on isChange to changeType none and a clear no on hasDeadline to no deadline', async () => {
    const t = await createTriager({ jev: fake().jev, now })('Send it by Friday.', profile)
    expect(t.changeType).toBe('none')
    expect(t.deadline).toBeNull()
    expect(t.evidence.deadline).toBeUndefined()
  })

  it('drops evidence that is not a verbatim piece of the message', async () => {
    const f = fake(() => ({
      evidenceTone: { choice: 'Alex sounds annoyed.' },
      evidenceUrgency: { choice: '   ' }
    }))
    const t = await createTriager({ jev: f.jev, now })('Please send the file today.', profile)
    expect(t.evidence).toEqual({})
  })

  it('keeps urgency evidence only when the urgency is explicit', async () => {
    const text = 'Please send the file today. Thanks.'
    const run = async (explicit: number): Promise<string | undefined> => {
      const f = fake(() => ({
        urgencyExplicit: { noul: explicit },
        evidenceUrgency: { choice: 'Please send the file today.' }
      }))
      return (await createTriager({ jev: f.jev, now })(text, profile)).evidence.urgency
    }
    expect(await run(0.95)).toBe('Please send the file today.')
    expect(await run(0.05)).toBeUndefined()
  })

  it('offers at most MAX_CANDIDATES sentences from a long message', async () => {
    const f = fake()
    const long = Array.from({ length: 30 }, (_, i) => `Item ${i + 1} is ready.`).join(' ')
    await createTriager({ jev: f.jev, now })(long, profile)
    const options = Object.keys(f.questions().evidenceTone.criteria!)
    expect(options).toHaveLength(MAX_CANDIDATES)
    expect(options[0]).toBe('Item 1 is ready.')
  })

  it('rejects an invalid Jev answer, a failure and a timeout without quoting the message', async () => {
    const secret = 'Alex wants the payroll file'
    const run = (jev: TriageJevClient): Promise<unknown> =>
      createTriager({ jev, now })(secret, profile)
    await expect(run(fake(() => ({ type: { choice: 'request' } })).jev)).rejects.toThrow(
      /^Jev returned an invalid triage answer\.$/
    )
    await expect(run(fake(() => ({ isChange: { noul: 1.5 } })).jev)).rejects.toThrow(/invalid/)
    await expect(
      run({
        ask: async () => {
          throw new Error(`boom: ${secret}`)
        }
      })
    ).rejects.toThrow(/^Jev could not triage the message\.$/)
    vi.useFakeTimers()
    const pending = run({ ask: () => new Promise(() => {}) })
    const check = expect(pending).rejects.toThrow(/^Jev did not answer the triage in time\.$/)
    await vi.advanceTimersByTimeAsync(JEV_TIMEOUT_MS)
    await check
  })

  it('rejects empty and over-long text before calling Jev', async () => {
    const f = fake()
    const triage = createTriager({ jev: f.jev, now })
    await expect(triage('   ', profile)).rejects.toThrow(/empty/)
    await expect(triage('x'.repeat(8001), profile)).rejects.toThrow(/too long/)
    expect(f.sent).toEqual([])
  })
})

describe('splitSentences', () => {
  it('splits lines and sentences, trims and drops punctuation-only pieces', () => {
    expect(splitSentences('Hi team.\n\nThe build is red! Can you look?\n---\nThx')).toEqual([
      'Hi team.',
      'The build is red!',
      'Can you look?',
      'Thx'
    ])
  })
})

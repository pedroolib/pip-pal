import { describe, expect, it } from 'vitest'
import samJson from '@shared/fixtures/sam.profile.json'
import checkInsJson from '@shared/fixtures/week.checkins.json'
import eventsJson from '@shared/fixtures/week.events.json'
import achievementsJson from '@shared/fixtures/achievements.json'
import { buildProfileContext, forRecipient } from '@shared/profile'
import {
  Achievement,
  CheckIn,
  Profile,
  UsageEvent,
  type Slot,
  type QuestionTopic
} from '@shared/schemas'
import {
  detectAsks,
  detectCalm,
  detectDrains,
  detectEnergy,
  detectPatterns,
  mergeLearned,
  periodWindow,
  summaryFacts,
  type Candidate
} from './insights'

const profile = Profile.parse(samJson)
// Local times, so the tests do not depend on the machine's time zone.
const at = (day: number, h: number, m = 0): string => new Date(2026, 9, day, h, m).toISOString()
const ci = (day: number, h: number, slot: Slot, spoons: number): CheckIn => ({
  at: at(day, h),
  slot,
  spoons
})
let n = 0
const ev = (day: number, h: number, m: number, body: object): UsageEvent =>
  UsageEvent.parse({ id: `e${n++}`, at: at(day, h, m), ...body })
const decoded = (day: number, h: number, extra: object = {}): UsageEvent =>
  ev(day, h, 0, {
    kind: 'decoded',
    text: 'The plan changed.',
    isChange: 0.9,
    changeType: 'project',
    isNewTask: 0.1,
    tone: 'neutral',
    ...extra
  })
const asked = (day: number, topic: QuestionTopic): UsageEvent =>
  ev(day, 10, 0, { kind: 'asked', topic, question: 'By when?' })
const calm = (day: number, h: number, strategyId: string | null = 'music'): UsageEvent =>
  ev(day, h, 0, { kind: 'calm', status: 'used', strategyId })
const days = (k: number): number[] => Array.from({ length: k }, (_, i) => 20 + i)

// A day with its low at midday: 4, 2, 3.
const lowMidday = (d: number): CheckIn[] => [
  ci(d, 9, 'morning', 4),
  ci(d, 13, 'midday', 2),
  ci(d, 17, 'afternoon', 3)
]

describe('periodWindow', () => {
  const now = new Date(2026, 10, 3, 15, 30)
  it('today starts at local midnight', () => {
    expect(periodWindow('today', now)).toEqual({ from: new Date(2026, 10, 3), to: now })
  })
  it.each([
    ['7d', 7],
    ['14d', 14],
    ['30d', 30]
  ] as const)('%s rolls back from now', (p, d) => {
    expect(periodWindow(p, now).from.getTime()).toBe(now.getTime() - d * 86_400_000)
  })
})

describe('detectEnergy', () => {
  it('stays quiet below the threshold', () => {
    expect(detectEnergy(days(2).flatMap(lowMidday))).toEqual([])
  })
  it('finds the lowest slot at the threshold', () => {
    const [c] = detectEnergy(days(3).flatMap(lowMidday))
    expect(c).toMatchObject({ key: 'energy:midday', section: 'energy' })
    expect(c.text).toMatch(/midday/)
    expect(c.why).toMatch(/3 of 3 days/)
  })
  it('a tie names no slot', () => {
    const flat = (d: number): CheckIn[] => [ci(d, 9, 'morning', 3), ci(d, 13, 'midday', 3)]
    expect(detectEnergy(days(4).flatMap(flat))).toEqual([])
  })
})

describe('detectDrains', () => {
  const drop = (d: number, extra: object = {}): { c: CheckIn[]; e: UsageEvent[] } => ({
    c: [ci(d, 9, 'morning', 4), ci(d, 13, 'midday', 2)],
    e: [decoded(d, 11, extra)]
  })
  const run = (k: number, extra: object = {}): Candidate[] => {
    const parts = days(k).map((d) => drop(d, extra))
    return detectDrains(
      parts.flatMap((p) => p.c),
      parts.flatMap((p) => p.e)
    )
  }
  it('stays quiet below the threshold', () => expect(run(2)).toEqual([]))
  it('names the category at the threshold, and never says caused', () => {
    const [c] = run(3)
    expect(c).toMatchObject({ key: 'drain:project', section: 'stress' })
    expect(c.text).toMatch(/often came with/)
    expect(`${c.text} ${c.why}`).not.toMatch(/caus/i)
    expect(c.why).toMatch(/3 times/)
  })
  it('falls back to new_task, then to the tone', () => {
    expect(run(3, { isChange: 0.1, isNewTask: 0.7 })[0].key).toBe('drain:new_task')
    expect(run(3, { isChange: 0.1, isNewTask: 0.1, tone: 'upset' })[0].key).toBe('drain:tone:upset')
  })
  it('ignores messages outside the drop and drops across days', () => {
    const c = days(3).flatMap((d) => [ci(d, 9, 'morning', 4), ci(d, 13, 'midday', 2)])
    expect(
      detectDrains(
        c,
        days(3).map((d) => decoded(d, 15))
      )
    ).toEqual([])
    const rise = days(3).flatMap((d) => [ci(d, 9, 'morning', 2), ci(d, 13, 'midday', 4)])
    expect(
      detectDrains(
        rise,
        days(3).map((d) => decoded(d, 11))
      )
    ).toEqual([])
  })
})

describe('detectAsks', () => {
  it('stays quiet below the threshold', () => {
    expect(detectAsks([asked(20, 'deadline'), asked(21, 'deadline'), asked(22, 'scope')])).toEqual(
      []
    )
  })
  it('finds the topic at the threshold', () => {
    const [c] = detectAsks(days(3).map((d) => asked(d, 'deadline')))
    expect(c).toMatchObject({ key: 'ask:deadline', section: 'communication' })
    expect(c.why).toMatch(/3 copied questions/)
  })
})

describe('detectCalm', () => {
  const day = (d: number, after: number): { c: CheckIn[]; e: UsageEvent[] } => ({
    c: [ci(d, 13, 'midday', 2), ci(d, 17, 'afternoon', after)],
    e: [calm(d, 14)]
  })
  const run = (afters: number[]): Candidate[] => {
    const parts = afters.map((a, i) => day(20 + i, a))
    return detectCalm(
      parts.flatMap((p) => p.c),
      parts.flatMap((p) => p.e),
      profile
    )
  }
  it('stays quiet below the threshold', () => expect(run([3, 3, 2])).toEqual([]))
  it('names the strategy at the threshold', () => {
    const [c] = run([3, 4, 3])
    expect(c).toMatchObject({ key: 'calm:music', section: 'stress' })
    expect(c.text).toMatch(/Listen to calm music/)
    expect(c.why).toMatch(/3 times/)
  })
  it('skips skipped, unknown and unnamed strategies', () => {
    const c = days(3).flatMap((d) => day(d, 4).c)
    const skipped = days(3).map((d) =>
      ev(d, 14, 0, { kind: 'calm', status: 'skipped', strategyId: 'music' })
    )
    expect(detectCalm(c, skipped, profile)).toEqual([])
    expect(
      detectCalm(
        c,
        days(3).map((d) => calm(d, 14, 'gone')),
        profile
      )
    ).toEqual([])
    expect(
      detectCalm(
        c,
        days(3).map((d) => calm(d, 14, null)),
        profile
      )
    ).toEqual([])
  })
})

describe('mergeLearned', () => {
  const now = new Date(2026, 10, 3)
  const [cand] = detectEnergy(days(3).flatMap(lowMidday))

  it('adds a candidate as a private pip pending entry', () => {
    const p = mergeLearned(profile, [cand], now)
    expect(p.pending).toHaveLength(1)
    expect(p.pending![0]).toMatchObject({ ...cand, origin: 'pip', visibleTo: [] })
    expect(p.pending![0].id).toBeTruthy()
  })
  it('never duplicates a pending key', () => {
    const once = mergeLearned(profile, [cand], now)
    expect(mergeLearned(once, [cand], now)).toBe(once)
  })
  it('skips a pattern already approved', () => {
    const approved = structuredClone(profile)
    approved.sections.energy = [{ text: cand.text, origin: 'pip', visibleTo: [] }]
    expect(mergeLearned(approved, [cand], now).pending ?? []).toEqual([])
  })
  it('stays quiet for 30 days after a dismiss, then may suggest again', () => {
    const day = 86_400_000
    const dismissed = (ago: number): Profile => ({
      ...profile,
      dismissed: [{ key: cand.key, at: new Date(now.getTime() - ago * day).toISOString() }]
    })
    expect(mergeLearned(dismissed(29), [cand], now).pending ?? []).toEqual([])
    expect(mergeLearned(dismissed(31), [cand], now).pending).toHaveLength(1)
  })
  it('pending entries never reach the profile context or a recipient', () => {
    const p = mergeLearned(profile, [cand], now)
    expect(buildProfileContext(p)).not.toContain(cand.text)
    expect(JSON.stringify(forRecipient(p, 'coach'))).not.toContain(cand.text)
  })
})

describe('the demo week', () => {
  it('makes each of the four patterns fire', () => {
    const data = {
      checkIns: CheckIn.array().parse(checkInsJson),
      events: UsageEvent.array().parse(eventsJson)
    }
    const keys = detectPatterns(data, profile, new Date(2026, 9, 20), new Date(2026, 10, 3)).map(
      (c) => c.key
    )
    expect(keys).toEqual(
      expect.arrayContaining(['energy:midday', 'drain:project', 'ask:deadline', 'calm:music'])
    )
  })
})

describe('summaryFacts', () => {
  const SECRET = 'Zebra-cactus memo 7781'
  const data = {
    checkIns: days(3).flatMap(lowMidday),
    events: [
      ...days(3).map((d) => decoded(d, 11, { text: `Please read the ${SECRET} today.` })),
      ...days(3).map((d) => asked(d, 'deadline')),
      calm(20, 14, 'coloring')
    ],
    achievements: Achievement.array().parse(achievementsJson)
  }
  const window = { from: new Date(2026, 9, 19), to: new Date(2026, 10, 3) }
  const all = (f: ReturnType<typeof summaryFacts>): string => JSON.stringify(f)

  it('gives the manager counts and topics only, never message text', () => {
    const f = summaryFacts('manager', data, profile, window)
    expect(all(f)).not.toContain(SECRET)
    expect(f.excerpts).toEqual([])
    expect(f.patterns).toEqual([])
    expect(f.facts.join('\n')).toMatch(/deadline 3/)
  })
  it('turns topic patterns into accommodations the manager must tick', () => {
    const f = summaryFacts('manager', data, profile, window)
    expect(f.extra).toEqual([
      expect.objectContaining({ text: 'Written deadlines help me.', include: false })
    ])
  })
  it('gives the coach excerpts and patterns', () => {
    const f = summaryFacts('coach', data, profile, window)
    expect(f.excerpts.join()).toContain(SECRET)
    expect(f.patterns.join('\n')).toMatch(/midday/)
    expect(f.extra).toEqual([])
  })
  it('names only the strategies the recipient may see', () => {
    expect(all(summaryFacts('coach', data, profile, window))).not.toContain('Colouring')
  })
  it('below 3 check-ins: no patterns, plus a fixed "not enough yet" point', () => {
    const few = { ...data, checkIns: data.checkIns.slice(0, 2) }
    for (const r of ['coach', 'manager'] as const) {
      const f = summaryFacts(r, few, profile, window)
      expect(f.patterns).toEqual([])
      expect(f.extra).toEqual([expect.objectContaining({ text: 'Not enough yet for patterns.' })])
      expect(f.facts.join('\n')).not.toMatch(/drop|higher/i)
    }
  })
  it('only counts what falls inside the window', () => {
    const f = summaryFacts('coach', data, profile, { from: new Date(2026, 9, 22), to: window.to })
    expect(f.facts.join('\n')).toMatch(/Check-ins: 3\./)
  })
})

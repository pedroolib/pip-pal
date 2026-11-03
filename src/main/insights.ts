// What Pip learns from the usage log and the check-ins, and the facts behind "My summary" (docs/DECISIONS.md §6).
// Pure: no I/O, `now` and windows are passed in. Texts are plain English here: main has no i18next.
import { forRecipient } from '@shared/profile'
import {
  DISMISS_DAYS,
  LEARN_MIN_COUNT,
  PATTERN_MIN_CHECKINS,
  type Achievement,
  type CheckIn,
  type PendingEntry,
  type Profile,
  type QuestionTopic,
  type Recipient,
  type Slot,
  type SummaryPeriod,
  type SummaryPoint,
  type UsageEvent
} from '@shared/schemas'

const DAY = 86_400_000
const DAYS: Record<Exclude<SummaryPeriod, 'today'>, number> = { '7d': 7, '14d': 14, '30d': 30 }

/** Rolling windows back from `now`; `today` starts at local midnight. */
export function periodWindow(period: SummaryPeriod, now: Date): { from: Date; to: Date } {
  const from =
    period === 'today'
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
      : new Date(now.getTime() - DAYS[period] * DAY)
  return { from, to: now }
}

export type Candidate = Pick<PendingEntry, 'key' | 'section' | 'text' | 'why'>
type Decoded = Extract<UsageEvent, { kind: 'decoded' }>
type Span = readonly [CheckIn, CheckIn]

const time = (x: { at: string }): number => new Date(x.at).getTime()
const isDecoded = (e: UsageEvent): e is Decoded => e.kind === 'decoded'
const tally = (keys: string[]): Map<string, number> =>
  keys.reduce((m, k) => m.set(k, (m.get(k) ?? 0) + 1), new Map<string, number>())
const often = (m: Map<string, number>): [string, number][] =>
  [...m].filter(([, n]) => n >= LEARN_MIN_COUNT)

// Check-ins grouped by local day, each day in time order.
function byDay(checkIns: CheckIn[]): CheckIn[][] {
  const days = new Map<string, CheckIn[]>()
  for (const c of [...checkIns].sort((a, b) => time(a) - time(b))) {
    const k = new Date(c.at).toDateString()
    days.set(k, [...(days.get(k) ?? []), c])
  }
  return [...days.values()]
}

// Two consecutive check-ins on the same day.
const spans = (checkIns: CheckIn[]): Span[] =>
  byDay(checkIns).flatMap((d) => d.slice(1).map((b, i) => [d[i], b] as const))
const inside = (e: UsageEvent, [a, b]: Span): boolean => time(a) < time(e) && time(e) <= time(b)

/** The change type when it is a change, else new_task when it is a task, else the tone. */
const category = (e: Decoded): string =>
  e.isChange >= 0.5 ? e.changeType : e.isNewTask >= 0.5 ? 'new_task' : `tone:${e.tone}`

// For each spoon drop, the categories of the messages decoded inside it.
const drops = (checkIns: CheckIn[], events: UsageEvent[]): string[][] =>
  spans(checkIns)
    .filter(([a, b]) => b.spoons < a.spoons)
    .map((s) => [
      ...new Set(
        events
          .filter(isDecoded)
          .filter((e) => inside(e, s))
          .map(category)
      )
    ])

// Each used strategy with a check-in before and after it that day, and whether spoons rose.
function calmResults(checkIns: CheckIn[], events: UsageEvent[]): { id: string; rose: boolean }[] {
  const all = spans(checkIns)
  return events.flatMap((e) => {
    if (e.kind !== 'calm' || e.status !== 'used' || !e.strategyId) return []
    const s = all.find((x) => inside(e, x))
    return s ? [{ id: e.strategyId, rose: s[1].spoons > s[0].spoons }] : []
  })
}

const WHEN: Record<Slot, string> = {
  morning: 'in the morning',
  midday: 'at midday',
  afternoon: 'in the afternoon'
}
const CATEGORY: Record<string, string> = {
  project: 'a project change',
  leader: 'a change of leader',
  priorities: 'a change of priorities',
  other: 'a change',
  none: 'a change',
  new_task: 'a new task',
  'tone:neutral': 'a neutral-sounding message',
  'tone:friendly': 'a friendly message',
  'tone:upset': 'an upset-sounding message',
  'tone:worried': 'a worried-sounding message'
}
const TOPIC: Record<QuestionTopic, string> = {
  deadline: 'deadlines',
  scope: 'the scope of a task',
  priority: 'which task comes first',
  who: 'who does what',
  format: 'the format of the result',
  other: 'other details'
}
// What the manager version says instead of "I keep asking about X".
const ACCOMMODATION: Record<QuestionTopic, string> = {
  deadline: 'Written deadlines help me.',
  scope: 'A clear scope for each task helps me.',
  priority: 'Knowing which task comes first helps me.',
  who: 'Knowing who does what helps me.',
  format: 'Knowing the format expected for the result helps me.',
  other: 'Clear written details help me.'
}

/** `energy:<slot>`: the slot that was the day's lowest (no tie) on LEARN_MIN_COUNT days or more. */
export function detectEnergy(checkIns: CheckIn[]): Candidate[] {
  const lows: string[] = []
  let days = 0
  for (const day of byDay(checkIns)) {
    const min = new Map<Slot, number>()
    for (const c of day) min.set(c.slot, Math.min(min.get(c.slot) ?? 5, c.spoons))
    if (min.size < 2) continue
    days++
    const low = Math.min(...min.values())
    const at = [...min].filter(([, s]) => s === low)
    if (at.length === 1) lows.push(at[0][0]) // a tie names no slot
  }
  return often(tally(lows)).map(([slot, n]) => ({
    key: `energy:${slot}`,
    section: 'energy',
    text: `Energy is often lowest ${WHEN[slot as Slot]}.`,
    why: `The ${slot} check-in was the lowest of the day on ${n} of ${days} days.`
  }))
}

/** `drain:<category>`: a spoon drop with a message of that category in between, LEARN_MIN_COUNT times. */
export function detectDrains(checkIns: CheckIn[], events: UsageEvent[]): Candidate[] {
  return often(tally(drops(checkIns, events).flat())).map(([cat, n]) => ({
    key: `drain:${cat}`,
    section: 'stress',
    text: `A drop in spoons often came with ${CATEGORY[cat]}.`,
    why: `Spoons went down between two check-ins with ${CATEGORY[cat]} in between, ${n} times.`
  }))
}

/** `ask:<topic>`: LEARN_MIN_COUNT copied questions or more on one topic. */
export function detectAsks(events: UsageEvent[]): Candidate[] {
  const topics = events.flatMap((e) => (e.kind === 'asked' ? [e.topic] : []))
  return often(tally(topics)).map(([topic, n]) => ({
    key: `ask:${topic}`,
    section: 'communication',
    text: `Messages that leave out ${TOPIC[topic as QuestionTopic]} often need a question.`,
    why: `${n} copied questions were about ${TOPIC[topic as QuestionTopic]}.`
  }))
}

/** `calm:<strategyId>`: used, and the next check-in that day was higher, LEARN_MIN_COUNT times. Only strategies in `profile`. */
export function detectCalm(
  checkIns: CheckIn[],
  events: UsageEvent[],
  profile: Profile
): Candidate[] {
  const rose = calmResults(checkIns, events)
    .filter((r) => r.rose)
    .map((r) => r.id)
  return often(tally(rose)).flatMap(([id, n]) => {
    const label = profile.calmingStrategies.find((s) => s.id === id)?.label
    if (!label) return [] // deleted, or not visible to this recipient
    return [
      {
        key: `calm:${id}`,
        section: 'stress' as const,
        text: `"${label}" often came before more spoons at the next check-in.`,
        why: `After "${label}", the next check-in that day was higher, ${n} times.`
      }
    ]
  })
}

const inWindow = <T extends { at: string }>(xs: T[], from: Date, to: Date): T[] =>
  xs.filter((x) => time(x) >= from.getTime() && time(x) <= to.getTime())

/** All four detectors over the window. */
export function detectPatterns(
  data: { checkIns: CheckIn[]; events: UsageEvent[] },
  profile: Profile,
  from: Date,
  to: Date
): Candidate[] {
  const checkIns = inWindow(data.checkIns, from, to)
  const events = inWindow(data.events, from, to)
  return [
    ...detectEnergy(checkIns),
    ...detectDrains(checkIns, events),
    ...detectAsks(events),
    ...detectCalm(checkIns, events, profile)
  ]
}

/** New candidates as private pending entries; skips keys already pending, approved (same text) or dismissed within DISMISS_DAYS. */
export function mergeLearned(profile: Profile, candidates: Candidate[], now: Date): Profile {
  const quietSince = now.getTime() - DISMISS_DAYS * DAY
  const known = (c: Candidate): boolean =>
    !!profile.pending?.some((p) => p.key === c.key) ||
    !!profile.sections[c.section]?.some((e) => e.text === c.text) ||
    !!profile.dismissed?.some((d) => d.key === c.key && time(d) >= quietSince)
  const fresh = candidates.filter((c) => !known(c))
  if (!fresh.length) return profile
  const added = fresh.map((c) => ({
    id: crypto.randomUUID(),
    ...c,
    origin: 'pip' as const,
    visibleTo: []
  }))
  return { ...profile, pending: [...(profile.pending ?? []), ...added] }
}

const list = (m: Map<string, number>): string =>
  [...m].map(([k, n]) => `${k} ${n}`).join(', ') || 'none'
const avg = (xs: number[]): string => (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1)

/**
 * What the summary may say for `recipient`, filtered here and not in the prompt. Raw: summary.ts scrubs it.
 * `extra` are points code writes itself. The manager gets counts and topics only, never message text.
 */
export function summaryFacts(
  recipient: Recipient,
  data: { checkIns: CheckIn[]; events: UsageEvent[]; achievements: Achievement[] },
  profile: Profile,
  { from, to }: { from: Date; to: Date }
): { facts: string[]; patterns: string[]; excerpts: string[]; extra: SummaryPoint[] } {
  const checkIns = inWindow(data.checkIns, from, to)
  const events = inWindow(data.events, from, to)
  const decoded = events.filter(isDecoded)
  const steps = events.flatMap((e) => (e.kind === 'step' ? [e.status] : []))
  const manager = recipient === 'manager'
  const enough = checkIns.length >= PATTERN_MIN_CHECKINS
  // Pending entries and private strategies never leave: only what this recipient may see.
  const visible = forRecipient(profile, recipient)

  const facts = [
    `Check-ins: ${checkIns.length}.`,
    `Messages decoded: ${decoded.length}.`,
    `Changes announced, by type: ${list(tally(decoded.filter((e) => e.isChange >= 0.5).map((e) => e.changeType)))}.`,
    `New tasks: ${decoded.filter((e) => category(e) === 'new_task').length}.`,
    `Questions copied, by topic: ${list(tally(events.flatMap((e) => (e.kind === 'asked' ? [e.topic] : []))))}.`,
    `Steps: ${steps.filter((s) => s === 'done').length} done, ${steps.filter((s) => s === 'can_wait').length} left for later.`,
    `Achievements, by kind: ${list(tally(inWindow(data.achievements, from, to).map((a) => a.kind)))}.`
  ]
  const extra: SummaryPoint[] = []
  if (!enough)
    extra.push({
      text: 'Not enough yet for patterns.',
      why: `${checkIns.length} check-ins in this period; patterns need at least ${PATTERN_MIN_CHECKINS}.`,
      source: 'checkins',
      include: false
    })

  // Spoons and calming strategies are health details: never in the manager version.
  if (manager) {
    if (enough)
      for (const c of detectAsks(events))
        extra.push({
          text: ACCOMMODATION[c.key.slice('ask:'.length) as QuestionTopic],
          why: c.why,
          source: 'profile',
          include: false // the person decides whether the manager sees it
        })
    return { facts, patterns: [], excerpts: [], extra }
  }

  const label = (id: string | null): string =>
    visible.calmingStrategies.find((s) => s.id === id)?.label ?? 'another strategy'
  const calm = (status: 'used' | 'skipped'): string =>
    list(
      tally(
        events.flatMap((e) =>
          e.kind === 'calm' && e.status === status ? [label(e.strategyId)] : []
        )
      )
    )
  for (const slot of ['morning', 'midday', 'afternoon'] as const) {
    const xs = checkIns.filter((c) => c.slot === slot).map((c) => c.spoons)
    if (xs.length) facts.push(`Average spoons, ${slot}: ${avg(xs)} (${xs.length} check-ins).`)
  }
  facts.push(
    `Calming strategies used: ${calm('used')}.`,
    `Calming strategies skipped: ${calm('skipped')}.`
  )
  if (enough) {
    const d = drops(checkIns, events)
    const results = calmResults(checkIns, events)
    facts.push(
      `Spoon drops between two check-ins on the same day: ${d.length}; messages decoded inside them, by kind: ${list(tally(d.flat()))}.`,
      `After a calming strategy, the next check-in that day was higher ${results.filter((r) => r.rose).length} of ${results.length} times.`
    )
  }
  const patterns = enough
    ? detectPatterns({ checkIns, events }, visible, from, to).map((c) => `${c.text} (${c.why})`)
    : []
  return { facts, patterns, excerpts: decoded.map((e) => e.text), extra }
}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Reminder } from '@shared/schemas'
import { dueFor, startReminders } from './reminders'

const steps = { kind: 'steps' as const, title: 'Open the report', source: 'msg' }

function setup(start = new Date(2026, 10, 3, 10, 0)): {
  reminders: ReturnType<typeof startReminders>
  seen: { r: Reminder; missed: boolean }[]
  advance: (ms: number) => void
  items: () => Reminder[]
} {
  let clock = start.getTime()
  let items: Reminder[] = []
  const seen: { r: Reminder; missed: boolean }[] = []
  const reminders = startReminders({
    store: { list: () => items, replace: (x) => (items = x) },
    onDue: (r, missed) => seen.push({ r, missed }),
    now: () => new Date(clock)
  })
  // Fake timers don't move Date, so the clock moves with them.
  const advance = (ms: number): void => {
    clock += ms
    vi.advanceTimersByTime(ms)
  }
  return { reminders, seen, advance, items: () => items }
}

describe('dueFor', () => {
  const now = new Date(2026, 10, 3, 10, 0)
  it('adds the minutes', () => {
    expect(dueFor('5m', now).getTime() - now.getTime()).toBe(5 * 60_000)
    expect(dueFor('1h', now).getTime() - now.getTime()).toBe(60 * 60_000)
  })
  it('tomorrow is 09:00 local the next day', () => {
    expect(dueFor('tomorrow', now)).toEqual(new Date(2026, 10, 4, 9, 0))
  })
})

describe('reminders', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('fires at the chosen time, then nudges at 5, 10 and 15 minutes, then parks', () => {
    const { reminders, seen, advance, items } = setup()
    reminders.add(steps, '15m')
    advance(14 * 60_000)
    expect(seen).toHaveLength(0)
    advance(60_000)
    expect(seen).toHaveLength(1)
    advance(5 * 60_000)
    advance(10 * 60_000)
    advance(15 * 60_000)
    expect(seen).toHaveLength(4)
    expect(items()[0].parked).toBe(true)
    advance(60 * 60_000)
    expect(seen).toHaveLength(4) // parked: silent
  })

  it('stops when finished', () => {
    const { reminders, seen, advance } = setup()
    const r = reminders.add(steps, '5m')
    advance(5 * 60_000)
    reminders.finish(r.id)
    advance(60 * 60_000)
    expect(seen).toHaveLength(1)
  })

  it('the same steps replace the earlier reminder', () => {
    const { reminders } = setup()
    reminders.add(steps, '5m')
    reminders.add(steps, '1h')
    expect(reminders.list()).toHaveLength(1)
    reminders.add({ ...steps, source: 'other' }, '1h')
    expect(reminders.list()).toHaveLength(2)
  })

  it('shows what came due while closed once, marked missed', () => {
    const { reminders, seen, advance } = setup()
    reminders.add(steps, '5m')
    reminders.stop() // Pip closed: no timer ran while the clock moved on
    advance(2 * 60 * 60_000)
    expect(seen).toHaveLength(0)
    reminders.resume()
    expect(seen).toHaveLength(1)
    expect(seen[0].missed).toBe(true)
  })

  it('reschedule gives the nudges back', () => {
    const { reminders, seen, advance } = setup()
    const r = reminders.add(steps, '5m')
    advance(5 * 60_000)
    reminders.reschedule(r.id, '30m')
    expect(reminders.list()[0].nudges).toBe(0)
    advance(29 * 60_000)
    expect(seen).toHaveLength(1)
    advance(60_000)
    expect(seen).toHaveLength(2)
  })

  it('finishKind drops every reminder of that kind', () => {
    const { reminders } = setup()
    reminders.add({ kind: 'checkin', title: 'Energy' }, '30m')
    reminders.add(steps, '30m')
    reminders.finishKind('checkin')
    expect(reminders.list().map((r) => r.kind)).toEqual(['steps'])
  })
})

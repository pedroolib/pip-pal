import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CheckIn, Slot } from '@shared/schemas'
import {
  currentSlot,
  nextCheckIn,
  parseCheckInTimes,
  startCheckInSchedule
} from './check-in-schedule'

const at = (h: number, m = 0, day = 2): Date => new Date(2026, 10, day, h, m)

describe('nextCheckIn', () => {
  it('picks the next time today, then tomorrow morning', () => {
    expect(nextCheckIn(at(8))).toEqual({ slot: 'morning', at: at(9) })
    expect(nextCheckIn(at(9))).toEqual({ slot: 'midday', at: at(13) })
    expect(nextCheckIn(at(16, 59))).toEqual({ slot: 'afternoon', at: at(17) })
    expect(nextCheckIn(at(18))).toEqual({ slot: 'morning', at: at(9, 0, 3) })
  })
})

describe('currentSlot', () => {
  it('is the slot whose time passed last', () => {
    expect(currentSlot(at(8))).toBeNull()
    expect(currentSlot(at(9))).toBe('morning')
    expect(currentSlot(at(14))).toBe('midday')
    expect(currentSlot(at(23))).toBe('afternoon')
  })
})

describe('startCheckInSchedule', () => {
  let checkIns: CheckIn[]
  let due: Slot[]
  let stop: () => void
  const start = (): ReturnType<typeof startCheckInSchedule> => {
    const s = startCheckInSchedule({ listCheckIns: () => checkIns, onDue: (x) => due.push(x) })
    stop = s.stop
    return s
  }

  beforeEach(() => {
    vi.useFakeTimers()
    checkIns = []
    due = []
  })
  afterEach(() => {
    stop()
    vi.useRealTimers()
  })

  it('asks at 9, 13 and 17 h, and again the next day', () => {
    vi.setSystemTime(at(8))
    start()
    vi.advanceTimersByTime(24 * 60 * 60 * 1000)
    expect(due).toEqual(['morning', 'midday', 'afternoon'])
    vi.advanceTimersByTime(60 * 60 * 1000)
    expect(due).toEqual(['morning', 'midday', 'afternoon', 'morning'])
  })

  it('skips a slot already answered today', () => {
    vi.setSystemTime(at(12))
    checkIns = [{ at: at(13, 30).toISOString(), slot: 'midday', spoons: 3 }]
    start()
    vi.advanceTimersByTime(2 * 60 * 60 * 1000)
    expect(due).toEqual([])
  })

  it('on wake, asks once for the slot missed during sleep', () => {
    vi.setSystemTime(at(12))
    const s = start()
    vi.setSystemTime(at(14)) // slept through 13 h: the timer never fired
    s.resume()
    s.resume()
    expect(due).toEqual(['midday'])
  })

  it('leaves the launch slot to the overlay', () => {
    vi.setSystemTime(at(10))
    start().resume()
    expect(due).toEqual([])
  })
})

describe('parseCheckInTimes', () => {
  it('reads three HH:MM times, else falls back', () => {
    expect(parseCheckInTimes('1:05, 1:06,1:07')?.map((t) => [t.slot, t.hour, t.minute])).toEqual([
      ['morning', 1, 5],
      ['midday', 1, 6],
      ['afternoon', 1, 7]
    ])
    expect(parseCheckInTimes(undefined)).toBeUndefined()
    expect(parseCheckInTimes('1:05,1:06')).toBeUndefined()
    expect(parseCheckInTimes('soon,1:06,1:07')).toBeUndefined()
  })
})

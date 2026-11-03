import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CheckIn, Slot } from '@shared/schemas'
import { nextCheckIn, parseCheckInTimes, startCheckInSchedule } from './check-in-schedule'

const at = (h: number, m = 0, day = 2): Date => new Date(2026, 10, day, h, m)
const HOUR = 60 * 60 * 1000
const DEFAULT = ['09:00', '13:00', '17:00']

describe('nextCheckIn', () => {
  it('picks the next time today, then tomorrow morning', () => {
    expect(nextCheckIn(at(8), DEFAULT)).toEqual(at(9))
    expect(nextCheckIn(at(9), DEFAULT)).toEqual(at(13))
    expect(nextCheckIn(at(16, 59), DEFAULT)).toEqual(at(17))
    expect(nextCheckIn(at(18), DEFAULT)).toEqual(at(9, 0, 3))
  })
  it('is null with no times', () => {
    expect(nextCheckIn(at(8), [])).toBeNull()
  })
})

describe('startCheckInSchedule', () => {
  let checkIns: CheckIn[]
  let due: Slot[]
  let times: string[]
  let stop: () => void
  const start = (): ReturnType<typeof startCheckInSchedule> => {
    const s = startCheckInSchedule({
      listCheckIns: () => checkIns,
      onDue: (x) => due.push(x),
      times: () => times
    })
    stop = s.stop
    return s
  }

  beforeEach(() => {
    vi.useFakeTimers()
    checkIns = []
    due = []
    times = DEFAULT
  })
  afterEach(() => {
    stop()
    vi.useRealTimers()
  })

  it('asks at 9, 13 and 17 h, and again the next day', () => {
    vi.setSystemTime(at(8))
    start()
    vi.advanceTimersByTime(24 * HOUR)
    expect(due).toEqual(['morning', 'midday', 'afternoon'])
    vi.advanceTimersByTime(HOUR)
    expect(due).toEqual(['morning', 'midday', 'afternoon', 'morning'])
  })

  it('skips a time already answered since the time before it', () => {
    vi.setSystemTime(at(12))
    checkIns = [{ at: at(10).toISOString(), slot: 'morning', spoons: 3 }]
    start()
    vi.advanceTimersByTime(2 * HOUR)
    expect(due).toEqual([])
  })

  it('asks two times in the same slot both', () => {
    times = ['09:00', '10:00']
    vi.setSystemTime(at(8))
    start()
    vi.advanceTimersByTime(3 * HOUR)
    expect(due).toEqual(['morning', 'morning'])
  })

  it('on wake, asks once for the latest time missed during sleep', () => {
    vi.setSystemTime(at(8))
    const s = start()
    vi.setSystemTime(at(14)) // slept through 9 and 13 h: the timer never fired
    s.resume()
    s.resume()
    expect(due).toEqual(['midday'])
  })

  it('applies an added or edited time after reschedule, without restart', () => {
    vi.setSystemTime(at(8))
    const s = start()
    times = ['08:30', '13:00', '17:00'] // 9:00 moved earlier
    s.reschedule()
    vi.advanceTimersByTime(HOUR)
    expect(due).toEqual(['morning'])
    times = ['08:30', '11:00', '13:00', '17:00']
    s.reschedule()
    vi.advanceTimersByTime(2.5 * HOUR) // 11:00 asked, nothing at 9:00 any more
    expect(due).toEqual(['morning', 'morning'])
  })

  it('does not ask a time moved into the past, on the next wake', () => {
    vi.setSystemTime(at(14))
    const s = start()
    times = ['09:00', '13:00', '13:30'] // 17:00 moved to 13:30
    s.reschedule()
    s.resume()
    expect(due).toEqual([])
  })

  it('does not ask a turned-off time', () => {
    vi.setSystemTime(at(8))
    const s = start()
    times = ['09:00', '17:00'] // 13:00 turned off
    s.reschedule()
    vi.advanceTimersByTime(12 * HOUR)
    expect(due).toEqual(['morning', 'afternoon'])
  })

  it('asks nothing when all are off, until one is turned on', () => {
    times = []
    vi.setSystemTime(at(8))
    const s = start()
    vi.advanceTimersByTime(48 * HOUR)
    s.resume()
    expect(due).toEqual([])
    times = ['20:00']
    s.reschedule()
    vi.advanceTimersByTime(24 * HOUR)
    expect(due).toEqual(['afternoon'])
  })

  it('leaves the launch-time ask to the overlay', () => {
    vi.setSystemTime(at(10))
    start().resume()
    expect(due).toEqual([])
  })
})

describe('parseCheckInTimes', () => {
  it('reads one to six HH:MM times, else falls back', () => {
    expect(parseCheckInTimes('1:05, 1:06,13:07')).toEqual(['01:05', '01:06', '13:07'])
    expect(parseCheckInTimes('10:05')).toEqual(['10:05'])
    expect(parseCheckInTimes(undefined)).toBeUndefined()
    expect(parseCheckInTimes('1:01,1:02,1:03,1:04,1:05,1:06,1:07')).toBeUndefined()
    expect(parseCheckInTimes('soon,1:06,1:07')).toBeUndefined()
    expect(parseCheckInTimes('24:00')).toBeUndefined()
  })
})

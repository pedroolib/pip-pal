import { describe, expect, it } from 'vitest'
import { dueCheckIn, type CheckIn } from '@shared/schemas'
import { isMac, rowBucket, nextFreeTime, shortcutKeys } from './settings'

describe('shortcutKeys', () => {
  it('uses the Mac symbols on Mac and words elsewhere', () => {
    expect(shortcutKeys(true)).toEqual(['⌃', '⇧', 'Space'])
    expect(shortcutKeys(false)).toEqual(['Ctrl', 'Shift', 'Space'])
  })
  it('detects a Mac from the platform string', () => {
    expect(isMac('MacIntel')).toBe(true)
    expect(isMac('Linux x86_64')).toBe(false)
  })
})

describe('dueCheckIn (the overlay launch ask)', () => {
  const at = (h: number, m = 0, day = 30): Date => new Date(2026, 9, day, h, m)
  const took = (d: Date): CheckIn => ({ at: d.toISOString(), slot: 'morning', spoons: 3 })
  const times = ['09:00', '13:00', '17:00']

  it('asks nothing before the first time', () => {
    expect(dueCheckIn(times, [], at(8, 59))).toBeNull()
  })
  it('asks the latest passed time when it is unanswered', () => {
    expect(dueCheckIn(times, [], at(14))).toBe('13:00')
  })
  it('counts a check-in within 30 minutes before the time, not an older one or yesterday', () => {
    const t4 = ['09:00', '13:00', '17:00', '21:40']
    expect(dueCheckIn(t4, [took(at(21, 36))], at(21, 40))).toBeNull() // the launch ask at 21:36
    expect(dueCheckIn(t4, [took(at(21, 5))], at(21, 40))).toBe('21:40')
    expect(dueCheckIn(t4, [took(at(21, 41))], at(21, 45))).toBeNull()
    expect(dueCheckIn(times, [took(at(10))], at(14))).toBe('13:00') // answered 09:00 only
    expect(dueCheckIn(times, [took(at(10, 0, 29))], at(10))).toBe('09:00')
    expect(dueCheckIn(['00:10', ...times], [took(at(23, 50, 29))], at(0, 10))).toBe('00:10')
  })
  it('asks two times in the same bucket both', () => {
    const t2 = ['09:00', '10:00']
    expect(dueCheckIn(t2, [took(at(8, 50))], at(9))).toBeNull()
    expect(dueCheckIn(t2, [took(at(8, 50))], at(10))).toBe('10:00')
  })
  it('asks nothing when every time is off', () => {
    expect(dueCheckIn([], [], at(14))).toBeNull()
  })
})

describe('nextFreeTime', () => {
  it('is one hour after the latest time', () => {
    expect(nextFreeTime(['09:00', '17:00', '13:00'])).toBe('18:00')
    expect(nextFreeTime(['09:30'])).toBe('10:30')
  })
  it('starts at 9:00 with no times, wraps past midnight and skips used times', () => {
    expect(nextFreeTime([])).toBe('09:00')
    expect(nextFreeTime(['23:30'])).toBe('00:30')
    expect(nextFreeTime(['23:00', '00:00'])).toBe('01:00')
  })
})

describe('rowBucket', () => {
  it('follows the time: before 12 Morning, 12-14:59 Midday, 15-17:59 Afternoon, 18+ Evening', () => {
    expect(
      ['09:00', '11:59', '12:00', '14:59', '15:00', '17:59', '18:00', '23:30'].map(rowBucket)
    ).toEqual([
      'morning',
      'morning',
      'midday',
      'midday',
      'afternoon',
      'afternoon',
      'evening',
      'evening'
    ])
  })
})

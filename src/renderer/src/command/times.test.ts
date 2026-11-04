import { describe, expect, it } from 'vitest'
import { customAt, describeWhen, quickAt } from './times'

// Tue Nov 3 2026, 3:42 PM local.
const now = new Date(2026, 10, 3, 15, 42)

describe('quickAt', () => {
  it('adds minutes from the moment asked', () => {
    expect(quickAt('in15', now).getTime()).toBe(now.getTime() + 15 * 60_000)
    expect(quickAt('in1h', now).getTime()).toBe(now.getTime() + 60 * 60_000)
  })
  it('tomorrow is the next calendar day at local 09:00, even late at night', () => {
    expect(quickAt('tomorrow9', now)).toEqual(new Date(2026, 10, 4, 9, 0))
    expect(quickAt('tomorrow9', new Date(2026, 10, 3, 23, 59))).toEqual(new Date(2026, 10, 4, 9, 0))
  })
  it('tomorrow stays at 09:00 across a month end', () => {
    expect(quickAt('tomorrow9', new Date(2026, 9, 31, 20, 0))).toEqual(new Date(2026, 10, 1, 9, 0))
  })
})

describe('customAt', () => {
  it('reads the two native inputs as local time', () => {
    expect(customAt('2026-11-05', '14:30')).toEqual(new Date(2026, 10, 5, 14, 30))
  })
  it('is null until both are filled', () => {
    expect(customAt('', '14:30')).toBeNull()
    expect(customAt('2026-11-05', '')).toBeNull()
  })
})

describe('describeWhen', () => {
  it('names today and tomorrow, then the exact moment', () => {
    expect(describeWhen(new Date(2026, 10, 4, 9, 0), now, 'en-US')).toBe(
      'tomorrow, Wed, Nov 4, 9:00 AM'
    )
    expect(describeWhen(new Date(2026, 10, 3, 16, 0), now, 'en-US')).toBe(
      'today, Tue, Nov 3, 4:00 PM'
    )
  })
  it('later days have no day word', () => {
    expect(describeWhen(new Date(2026, 10, 6, 9, 0), now, 'en-US')).toBe('Fri, Nov 6, 9:00 AM')
  })
})

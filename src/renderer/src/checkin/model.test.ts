import { describe, expect, it } from 'vitest'
import type { CheckIn } from '@shared/schemas'
import { slotFor, spoonsToday } from './model'

describe('slotFor', () => {
  const at = (h: number): Date => new Date(2026, 10, 2, h, 30)

  it('maps the time of day to the check-in slot', () => {
    expect(slotFor(at(8))).toBe('morning')
    expect(slotFor(at(12))).toBe('morning')
    expect(slotFor(at(13))).toBe('midday')
    expect(slotFor(at(17))).toBe('afternoon')
  })
})

describe('spoonsToday', () => {
  const now = new Date(2026, 10, 2, 15, 0)
  const checkIn = (day: number, h: number, spoons: number): CheckIn => ({
    at: new Date(2026, 10, day, h, 0).toISOString(),
    slot: 'morning',
    spoons
  })

  it("uses today's latest check-in, whatever the list order", () => {
    expect(spoonsToday([checkIn(2, 13, 4), checkIn(2, 9, 2)], now)).toBe(4)
  })

  it('ignores earlier days', () => {
    expect(spoonsToday([checkIn(1, 18, 1)], now)).toBeNull()
    expect(spoonsToday([], now)).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { slotFor } from './model'

describe('slotFor', () => {
  const at = (h: number): Date => new Date(2026, 10, 2, h, 30)

  it('maps the time of day to the check-in slot', () => {
    expect(slotFor(at(8))).toBe('morning')
    expect(slotFor(at(12))).toBe('morning')
    expect(slotFor(at(13))).toBe('midday')
    expect(slotFor(at(17))).toBe('afternoon')
  })
})

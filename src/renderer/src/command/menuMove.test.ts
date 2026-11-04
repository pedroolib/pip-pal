import { describe, expect, it } from 'vitest'
import { menuMove } from './menuMove'

describe('menuMove', () => {
  it('starts from nothing selected: down at the first row, up at the last', () => {
    for (const key of ['ArrowDown', 'Tab']) expect(menuMove(key, null, 5)).toBe(0)
    for (const key of ['ArrowUp', 'Shift+Tab']) expect(menuMove(key, null, 5)).toBe(4)
  })

  it('moves one row and wraps at both ends', () => {
    expect(menuMove('ArrowDown', 1, 5)).toBe(2)
    expect(menuMove('Tab', 4, 5)).toBe(0)
    expect(menuMove('ArrowUp', 1, 5)).toBe(0)
    expect(menuMove('Shift+Tab', 0, 5)).toBe(4)
  })

  it('jumps with Home and End, and ignores other keys', () => {
    expect(menuMove('Home', 3, 5)).toBe(0)
    expect(menuMove('End', null, 5)).toBe(4)
    expect(menuMove('a', 2, 5)).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/schemas'
import { isMac, shortcutKeys, slotOn } from './settings'

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

describe('slotOn', () => {
  it('follows the slot the time falls in', () => {
    const s = { ...DEFAULT_SETTINGS, checkIns: { ...DEFAULT_SETTINGS.checkIns, midday: false } }
    expect(slotOn(s, new Date(2026, 9, 30, 9))).toBe(true)
    expect(slotOn(s, new Date(2026, 9, 30, 13, 5))).toBe(false)
  })
})

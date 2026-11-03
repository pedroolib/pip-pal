import { describe, expect, it } from 'vitest'
import { hashFor, TABS, tabFromHash } from './route'

describe('house routing', () => {
  it('maps #/home to Home', () => expect(tabFromHash('#/home')).toBe('home'))
  it('maps a known subpath to its tab', () => {
    expect(tabFromHash('#/home/summary')).toBe('summary')
    expect(tabFromHash('#/home/profile')).toBe('profile')
  })
  it('falls back to Home for unknown subpaths', () => {
    expect(tabFromHash('#/home/nope')).toBe('home')
    expect(tabFromHash('#/home/summary/extra')).toBe('home')
  })
  it('round-trips every tab', () => {
    for (const t of TABS) expect(tabFromHash(hashFor(t))).toBe(t)
  })
  it('writes Home as plain #/home', () => expect(hashFor('home')).toBe('#/home'))
})

import { describe, expect, it } from 'vitest'
import { REPLY_TONES } from '@shared/schemas'
import { withTone } from './tone'

describe('withTone', () => {
  it('leaves the prompt alone for plain or no choice', () => {
    expect(withTone('SYS')).toBe('SYS')
    expect(withTone('SYS', 'plain')).toBe('SYS')
  })

  it.each(REPLY_TONES.filter((t) => t !== 'plain'))(
    'adds a %s block that keeps drafts neutral',
    (tone) => {
      const out = withTone('SYS', tone)
      expect(out.startsWith('SYS\n\nTone:')).toBe(true)
      expect(out).toContain('stays neutral and polite')
    }
  )
})

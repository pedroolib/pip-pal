import { describe, expect, it } from 'vitest'
import { isSafeExternalUrl } from './external-links'

describe('isSafeExternalUrl', () => {
  it('accepts https, whatever the case of the scheme', () => {
    expect(isSafeExternalUrl('https://example.com/a?b=1')).toBe(true)
    expect(isSafeExternalUrl('HTTPS://example.com')).toBe(true)
  })

  it.each([
    'http://example.com',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'data:text/html,<script>1</script>',
    'myapp://open',
    '/relative/path',
    'example.com',
    'not a url',
    ''
  ])('rejects %s', (url) => {
    expect(isSafeExternalUrl(url)).toBe(false)
  })
})

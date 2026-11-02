import { describe, expect, it } from 'vitest'
import { resolveModel } from './models'

describe('resolveModel', () => {
  it('defaults to sonnet', () => {
    expect(resolveModel(undefined)).toBe('claude-sonnet-5-5')
    expect(resolveModel('')).toBe('claude-sonnet-5-5')
  })

  it('maps haiku and sonnet', () => {
    expect(resolveModel('haiku')).toBe('claude-haiku-5-5')
    expect(resolveModel('sonnet')).toBe('claude-sonnet-5-5')
  })

  it('rejects an unknown value naming the valid ones', () => {
    expect(() => resolveModel('opus')).toThrow(/PIP_MODEL.*sonnet.*haiku/)
  })
})

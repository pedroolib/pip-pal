import { describe, expect, it, vi } from 'vitest'
import { createMockApi } from '@shared/mock-api'
import { createAiHandlers } from './index'
import { MAX_CHARS } from './decoder'

const profile = { owner: 'x' } as never
const SECRET = 'Dana Quillfeather secret plan'

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- test helper, the returned shape is the point
function setup(env: Record<string, string | undefined>) {
  const api = createMockApi()
  const realTriage = vi.fn(async () => ({ real: 'triage' }) as never)
  const realExpand = vi.fn(async () => ({ real: 'expand' }) as never)
  const makeTriager = vi.fn(() => realTriage)
  const makeExpander = vi.fn(() => realExpand)
  const log = vi.fn()
  const load = vi.fn(() => profile)
  const ai = createAiHandlers({ env, api, load, makeTriager, makeExpander, log })
  return { ai, api, realTriage, realExpand, makeTriager, makeExpander, log, load }
}

describe('key switch', () => {
  it('uses the real triager and expander when their keys are set, with the live profile', async () => {
    const s = setup({ TYPESAFE_API_KEY: 'k', ANTHROPIC_API_KEY: 'k' })
    expect(await s.ai.triage('hello')).toEqual({ real: 'triage' })
    expect(await s.ai.expand('hello', 'steps', 3)).toEqual({ real: 'expand' })
    expect(s.realTriage).toHaveBeenCalledWith('hello', profile)
    expect(s.realExpand).toHaveBeenCalledWith('hello', 'steps', 3, profile)
  })

  it('serves the fixtures and builds nothing without keys', async () => {
    const s = setup({})
    expect(s.makeTriager).not.toHaveBeenCalled()
    expect(s.makeExpander).not.toHaveBeenCalled()
    expect(await s.ai.triage('hello')).toEqual(await s.api.triage('hello'))
    expect((await s.ai.expand('hello', 'questions', null)).kind).toBe('questions')
    expect(s.log).toHaveBeenCalledTimes(2)
  })

  it('switches each path on its own key', async () => {
    const s = setup({ TYPESAFE_API_KEY: 'k' })
    expect(await s.ai.triage('hello')).toEqual({ real: 'triage' })
    expect((await s.ai.expand('hello', 'steps', 1)).kind).toBe('steps')
    expect(s.makeExpander).not.toHaveBeenCalled()
  })
})

describe('input validation', () => {
  it.each([
    ['not a string', 42],
    ['empty', '  '],
    ['too long', 'a'.repeat(MAX_CHARS + 1)]
  ])('rejects text that is %s on both paths', async (_, text) => {
    const s = setup({ TYPESAFE_API_KEY: 'k', ANTHROPIC_API_KEY: 'k' })
    await expect(s.ai.triage(text as never)).rejects.toThrow()
    await expect(s.ai.expand(text as never, 'steps', 3)).rejects.toThrow()
    expect(s.realTriage).not.toHaveBeenCalled()
    expect(s.realExpand).not.toHaveBeenCalled()
  })

  it.each(['plan', undefined, 7])('rejects kind %s', async (kind) => {
    const s = setup({})
    await expect(s.ai.expand('hi', kind as never, 3)).rejects.toThrow(/action kind/)
  })

  it.each([0, 6, 2.5, '3', undefined, NaN])('rejects spoons %s', async (spoons) => {
    const s = setup({})
    await expect(s.ai.expand('hi', 'steps', spoons as never)).rejects.toThrow(/spoons/i)
  })

  it('accepts null and 1 to 5', async () => {
    const s = setup({})
    for (const sp of [null, 1, 5]) await s.ai.expand('hi', 'steps', sp)
  })

  it('never echoes the input in an error', async () => {
    const s = setup({})
    const bad = [
      s.ai.triage(SECRET + 'a'.repeat(MAX_CHARS)),
      s.ai.expand(SECRET + 'a'.repeat(MAX_CHARS), 'steps', 3),
      s.ai.expand(SECRET, SECRET as never, 3),
      s.ai.expand(SECRET, 'steps', SECRET as never)
    ]
    for (const p of bad) {
      const e = await p.catch((x: Error) => x)
      expect(e).toBeInstanceOf(Error)
      expect((e as Error).message).not.toContain('Quillfeather')
    }
  })
})

describe('one running call per key', () => {
  const deferred = <T>(): { promise: Promise<T>; resolve: (v: T) => void } => {
    let resolve!: (v: T) => void
    const promise = new Promise<T>((a) => {
      resolve = a
    })
    return { promise, resolve }
  }
  const keys = { TYPESAFE_API_KEY: 'k', ANTHROPIC_API_KEY: 'k' }

  it('joins the same text, refuses another text without echoing it, and clears when done', async () => {
    const s = setup(keys)
    const d = deferred<never>()
    s.realExpand.mockReturnValueOnce(d.promise)
    const first = s.ai.expand('same', 'steps', 3)
    const again = s.ai.expand('same', 'steps', 3)
    const e = await s.ai.expand(SECRET, 'steps', 3).catch((x: Error) => x)
    expect((e as Error).message).toMatch(/still working/)
    expect((e as Error).message).not.toContain('Quillfeather')
    d.resolve({ real: 'late' } as never)
    expect(await first).toEqual({ real: 'late' })
    expect(await again).toEqual({ real: 'late' })
    expect(s.realExpand).toHaveBeenCalledTimes(1)
    await s.ai.expand(SECRET, 'steps', 3)
    expect(s.realExpand).toHaveBeenCalledTimes(2)
  })

  it('clears the entry when the call rejects', async () => {
    const s = setup(keys)
    s.realExpand.mockRejectedValueOnce(new Error('boom'))
    await expect(s.ai.expand('a', 'steps', 3)).rejects.toThrow('boom')
    expect(await s.ai.expand('b', 'steps', 3)).toEqual({ real: 'expand' })
  })

  it('joins the same text and spoons, refuses the same text with other spoons, and clears after', async () => {
    const s = setup(keys)
    const d = deferred<never>()
    s.realExpand.mockReturnValueOnce(d.promise)
    const first = s.ai.expand('same', 'steps', 3)
    const again = s.ai.expand('same', 'steps', 3)
    const e = await s.ai.expand('same', 'steps', 4).catch((x: Error) => x)
    expect((e as Error).message).toMatch(/still working/)
    d.resolve({ real: 'late' } as never)
    expect(await first).toEqual({ real: 'late' })
    expect(await again).toEqual({ real: 'late' })
    expect(s.realExpand).toHaveBeenCalledTimes(1)
    await s.ai.expand('same', 'steps', 4)
    expect(s.realExpand).toHaveBeenCalledTimes(2)
  })

  it('treats null spoons and 3 as different calls', async () => {
    const s = setup(keys)
    const d = deferred<never>()
    s.realExpand.mockReturnValueOnce(d.promise)
    const first = s.ai.expand('same', 'steps', null)
    await expect(s.ai.expand('same', 'steps', 3)).rejects.toThrow(/still working/)
    d.resolve({} as never)
    await first
  })

  it('lets 3 expands and 1 triage run at once, but not two for one key', async () => {
    const s = setup(keys)
    const ds = [deferred<never>(), deferred<never>(), deferred<never>(), deferred<never>()]
    s.realExpand
      .mockReturnValueOnce(ds[0].promise)
      .mockReturnValueOnce(ds[1].promise)
      .mockReturnValueOnce(ds[2].promise)
    s.realTriage.mockReturnValueOnce(ds[3].promise)
    const all = [
      s.ai.expand('t', 'steps', 3),
      s.ai.expand('t', 'questions', 3),
      s.ai.expand('t', 'transition', 3),
      s.ai.triage('t')
    ]
    await expect(s.ai.triage('other')).rejects.toThrow(/still working/)
    expect(s.realExpand).toHaveBeenCalledTimes(3)
    ds.forEach((d) => d.resolve({} as never))
    await Promise.all(all)
  })
})

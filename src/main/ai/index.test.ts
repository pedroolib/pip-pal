import { describe, expect, it, vi } from 'vitest'
import { createMockApi } from '@shared/mock-api'
import { CORRECTION_MAX } from '@shared/ipc'
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
  const realUnstick = vi.fn(async () => ({ real: 'unstick' }) as never)
  const makeUnsticker = vi.fn(() => realUnstick)
  const realSummary = vi.fn(async () => ({ real: 'summary' }) as never)
  const makeSummarizer = vi.fn(() => realSummary)
  const realRemember = vi.fn(async () => null)
  const makeRememberer = vi.fn(() => realRemember)
  const realTell = vi.fn(async (): Promise<{ reply: string; why: string; note: null }> => ({
    reply: 'real',
    why: 'real',
    note: null
  }))
  const makeTeller = vi.fn(() => realTell)
  const realMerge = vi.fn(async () => [])
  const makeMerger = vi.fn(() => realMerge)
  const summaryData = vi.fn(() => ({ checkIns: [], events: [], achievements: [] }))
  const logEvent = vi.fn()
  const log = vi.fn()
  const load = vi.fn(() => profile)
  const save = vi.fn()
  const realDraft = vi.fn(async () => [{ id: 'd1' }] as never)
  const makeDrafter = vi.fn(() => realDraft)
  const ai = createAiHandlers({
    env,
    api,
    load,
    save,
    makeTriager,
    makeExpander,
    makeUnsticker,
    makeRememberer,
    makeTeller,
    makeMerger,
    makeSummarizer,
    makeDrafter,
    summaryData,
    logEvent,
    log
  })
  return {
    ai,
    api,
    realTriage,
    realExpand,
    realUnstick,
    realSummary,
    realRemember,
    realTell,
    realMerge,
    makeTriager,
    makeExpander,
    makeUnsticker,
    makeSummarizer,
    logEvent,
    log,
    load,
    save,
    realDraft
  }
}

describe('usage logging', () => {
  it('logs a decoded event with the raw text and labels after a triage', async () => {
    const s = setup({})
    const t = await s.ai.triage('Moving you to Q1.')
    expect(s.logEvent).toHaveBeenCalledWith({
      kind: 'decoded',
      text: 'Moving you to Q1.',
      isChange: t.isChange,
      changeType: t.changeType,
      isNewTask: t.isNewTask,
      tone: t.tone.value
    })
  })

  it('logs an action after each expand', async () => {
    const s = setup({})
    await s.ai.expand('hi', 'questions', 3)
    expect(s.logEvent).toHaveBeenCalledWith({ kind: 'action', action: 'questions' })
  })

  it('logs nothing when the call fails', async () => {
    const s = setup({ TYPESAFE_API_KEY: 'k', ANTHROPIC_API_KEY: 'k' })
    s.realTriage.mockRejectedValueOnce(new Error('boom'))
    s.realExpand.mockRejectedValueOnce(new Error('boom'))
    await expect(s.ai.triage('a')).rejects.toThrow('boom')
    await expect(s.ai.expand('a', 'steps', 3)).rejects.toThrow('boom')
    expect(s.logEvent).not.toHaveBeenCalled()
  })

  it('a failed log never fails the triage or the expand', async () => {
    const s = setup({})
    s.logEvent.mockImplementation(() => {
      throw new Error('disk full')
    })
    expect((await s.ai.triage('hello')).source).toBe('jev')
    expect((await s.ai.expand('hello', 'steps', 3)).kind).toBe('steps')
  })
})

describe('draftProfile', () => {
  it('adds the drafted suggestions to the re-read profile and saves it', async () => {
    const s = setup({ ANTHROPIC_API_KEY: 'k' })
    const before = { pending: [{ id: 'old' }] } as never
    s.load.mockReturnValueOnce(profile).mockReturnValueOnce(before)
    const out = await s.ai.draftProfile({ calming: 'music' })
    expect(s.realDraft).toHaveBeenCalledWith({ calming: 'music' }, profile)
    expect(out).toEqual({ pending: [{ id: 'old' }, { id: 'd1' }] })
    expect(s.save).toHaveBeenCalledWith(out)
  })

  it('without a key, rejects and never falls back to the fixture', async () => {
    const s = setup({})
    await expect(s.ai.draftProfile({ calming: 'music' })).rejects.toThrow(/cannot reach/)
    expect(s.save).not.toHaveBeenCalled()
  })

  it('saves nothing when the call fails', async () => {
    const s = setup({ ANTHROPIC_API_KEY: 'k' })
    s.realDraft.mockRejectedValueOnce(new Error('boom'))
    await expect(s.ai.draftProfile({ calming: 'music' })).rejects.toThrow('boom')
    expect(s.save).not.toHaveBeenCalled()
  })
})

describe('generateSummary', () => {
  it('uses the real summarizer with the live profile and data when the key is set', async () => {
    const s = setup({ ANTHROPIC_API_KEY: 'k' })
    expect(await s.ai.generateSummary('coach', '14d')).toEqual({ real: 'summary' })
    expect(s.realSummary).toHaveBeenCalledWith('coach', '14d', profile, {
      checkIns: [],
      events: [],
      achievements: []
    })
  })

  it('without a key, returns the fixture for the recipient and period', async () => {
    const s = setup({})
    expect(s.makeSummarizer).not.toHaveBeenCalled()
    expect(await s.ai.generateSummary('manager', 'today')).toMatchObject({
      recipient: 'manager',
      period: 'today'
    })
  })

  it.each([
    [SECRET, '7d'],
    ['coach', SECRET],
    [undefined, '7d'],
    ['coach', null]
  ])('rejects %s / %s without echoing it', async (r, p) => {
    const s = setup({ ANTHROPIC_API_KEY: 'k' })
    const e = await s.ai.generateSummary(r as never, p as never).catch((x: Error) => x)
    expect((e as Error).message).toMatch(/Unknown/)
    expect((e as Error).message).not.toContain('Quillfeather')
    expect(s.realSummary).not.toHaveBeenCalled()
  })
})

describe('key switch', () => {
  it('uses the real triager and expander when their keys are set, with the live profile', async () => {
    const s = setup({ TYPESAFE_API_KEY: 'k', ANTHROPIC_API_KEY: 'k' })
    expect(await s.ai.triage('hello')).toEqual({ real: 'triage' })
    expect(await s.ai.expand('hello', 'steps', 3)).toEqual({ real: 'expand' })
    expect(s.realTriage).toHaveBeenCalledWith('hello', profile)
    expect(s.realExpand).toHaveBeenCalledWith('hello', 'steps', 3, profile, undefined, undefined)
  })

  it('serves the fixtures and builds nothing without keys', async () => {
    const s = setup({})
    expect(s.makeTriager).not.toHaveBeenCalled()
    expect(s.makeExpander).not.toHaveBeenCalled()
    expect(await s.ai.triage('hello')).toEqual(await s.api.triage('hello'))
    expect((await s.ai.expand('hello', 'questions', null)).kind).toBe('questions')
    expect(s.log).toHaveBeenCalledTimes(4)
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

  it('passes valid unclear hints to the expander and the fixture', async () => {
    const s = setup({ ANTHROPIC_API_KEY: 'k' })
    await s.ai.expand('hi', 'questions', 3, ['what_or_who', 'deadline'])
    expect(s.realExpand).toHaveBeenCalledWith(
      'hi',
      'questions',
      3,
      profile,
      ['what_or_who', 'deadline'],
      undefined
    )
    const f = setup({})
    for (const u of [undefined, [], ['deadline']] as const)
      expect((await f.ai.expand('hi', 'questions', 3, u && [...u])).kind).toBe('questions')
  })

  it.each([
    ['not an array', 'deadline'],
    ['null', null],
    ['an unknown part', ['when']],
    ['a duplicate', ['deadline', 'deadline']],
    ['too many', ['deadline', 'what_or_who', 'deadline']],
    ['secret text', [SECRET]]
  ])('rejects unclear hints that are %s without echoing them', async (_, unclear) => {
    const s = setup({ ANTHROPIC_API_KEY: 'k' })
    const e = await s.ai.expand('hi', 'questions', 3, unclear as never).catch((x: Error) => x)
    expect((e as Error).message).toMatch(/unclear/i)
    expect((e as Error).message).not.toContain('Quillfeather')
    expect(s.realExpand).not.toHaveBeenCalled()
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

  it('keys on the unclear hints too, in any order', async () => {
    const s = setup(keys)
    const d = deferred<never>()
    s.realExpand.mockReturnValueOnce(d.promise)
    const first = s.ai.expand('same', 'questions', 3, ['deadline', 'what_or_who'])
    const again = s.ai.expand('same', 'questions', 3, ['what_or_who', 'deadline'])
    await expect(s.ai.expand('same', 'questions', 3, ['deadline'])).rejects.toThrow(/still working/)
    await expect(s.ai.expand('same', 'questions', 3)).rejects.toThrow(/still working/)
    d.resolve({ real: 'late' } as never)
    expect(await again).toEqual(await first)
    expect(s.realExpand).toHaveBeenCalledTimes(1)
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

describe('unstick', () => {
  it('uses the real unsticker with a key, with the live profile', async () => {
    const s = setup({ ANTHROPIC_API_KEY: 'k' })
    expect(await s.ai.unstick('hello', 'Write the note.', 3, 'A doc.')).toEqual({ real: 'unstick' })
    expect(s.realUnstick).toHaveBeenCalledWith('hello', 'Write the note.', 3, profile, 'A doc.')
  })

  it('serves the fixture and builds nothing without a key', async () => {
    const s = setup({})
    expect(s.makeUnsticker).not.toHaveBeenCalled()
    expect(await s.ai.unstick('hello', 'Write the note.', null)).toEqual(
      await s.api.unstick('hello', 'Write the note.', null)
    )
  })

  it.each([
    ['not a string', 42],
    ['empty', '  '],
    ['too long', 'a'.repeat(CORRECTION_MAX + 1)]
  ])('rejects a step that is %s before any call', async (_, step) => {
    const s = setup({ ANTHROPIC_API_KEY: 'k' })
    await expect(s.ai.unstick('hi', step as never, 3)).rejects.toThrow(/step/)
    expect(s.realUnstick).not.toHaveBeenCalled()
  })

  it.each([
    ['not a string', 42],
    ['too long', 'a'.repeat(CORRECTION_MAX + 1)]
  ])('rejects an answer that is %s before any call', async (_, answer) => {
    const s = setup({ ANTHROPIC_API_KEY: 'k' })
    await expect(s.ai.unstick('hi', 'Step.', 3, answer as never)).rejects.toThrow(/answer/)
    expect(s.realUnstick).not.toHaveBeenCalled()
  })

  it.each([0, 6, 2.5, '3', undefined])('rejects spoons %s', async (spoons) => {
    const s = setup({})
    await expect(s.ai.unstick('hi', 'Step.', spoons as never)).rejects.toThrow(/spoons/i)
  })

  it('never echoes the input in an error', async () => {
    const s = setup({})
    const bad = [
      s.ai.unstick(SECRET + 'a'.repeat(MAX_CHARS), 'Step.', 3),
      s.ai.unstick('hi', SECRET + 'a'.repeat(CORRECTION_MAX), 3),
      s.ai.unstick('hi', 'Step.', 3, SECRET + 'a'.repeat(CORRECTION_MAX)),
      s.ai.unstick('hi', 'Step.', SECRET as never)
    ]
    for (const p of bad) {
      const e = await p.catch((x: Error) => x)
      expect(e).toBeInstanceOf(Error)
      expect((e as Error).message).not.toContain('Quillfeather')
    }
  })

  it('joins the same step, refuses another one while it runs, and clears when done', async () => {
    const s = setup({ ANTHROPIC_API_KEY: 'k' })
    let resolve!: (v: never) => void
    s.realUnstick.mockReturnValueOnce(new Promise((a) => (resolve = a)))
    const first = s.ai.unstick('same', 'Step.', 3)
    const again = s.ai.unstick('same', 'Step.', 3)
    await expect(s.ai.unstick('same', 'Other step.', 3)).rejects.toThrow(/still working/)
    resolve({ real: 'late' } as never)
    expect(await first).toEqual({ real: 'late' })
    expect(await again).toEqual({ real: 'late' })
    await s.ai.unstick('same', 'Other step.', 3)
    expect(s.realUnstick).toHaveBeenCalledTimes(2)
  })
})

describe('proposeMerges', () => {
  it('uses the real merger with a key and the fixture without one', async () => {
    const s = setup({ ANTHROPIC_API_KEY: 'k' })
    await s.ai.proposeMerges()
    expect(s.realMerge).toHaveBeenCalledOnce()
    const f = setup({})
    await f.ai.proposeMerges()
    expect(f.realMerge).not.toHaveBeenCalled()
  })
})

describe('tellPip', () => {
  const keys = { ANTHROPIC_API_KEY: 'k' }

  it('uses the real teller with a key', async () => {
    const s = setup(keys)
    expect(await s.ai.tellPip('hello')).toEqual({ reply: 'real', why: 'real', note: null })
    expect(s.realTell).toHaveBeenCalledWith('hello')
  })

  it('without a key still uses the real teller, so the words reach the real notes', async () => {
    const s = setup({})
    expect((await s.ai.tellPip('hello')).reply).toBe('real')
    expect(s.realTell).toHaveBeenCalledOnce()
  })

  it('in the demo without a key, answers from the fixture like the other handlers', async () => {
    const s = setup({ PIP_DEMO: '1' })
    expect((await s.ai.tellPip('hello')).reply).toEqual(expect.any(String))
    expect(s.realTell).not.toHaveBeenCalled()
  })

  it('in the demo with a key, uses the real teller like the other handlers', async () => {
    const s = setup({ ...keys, PIP_DEMO: '1' })
    await s.ai.tellPip('hello')
    expect(s.realTell).toHaveBeenCalledOnce()
  })

  it.each([
    ['not a string', 42],
    ['missing', undefined],
    ['empty', ''],
    ['only spaces', '  \n '],
    ['only invisible characters', '​﻿­'],
    ['too long', 'x'.repeat(CORRECTION_MAX + 1)],
    ['too long and secret', SECRET + 'x'.repeat(CORRECTION_MAX)]
  ])('rejects a message that is %s, without echoing it', async (_, message) => {
    for (const env of [keys, {}, { PIP_DEMO: '1' }]) {
      const s = setup(env)
      const e = await s.ai.tellPip(message as never).catch((x: Error) => x)
      expect((e as Error).message).toMatch(/message/)
      expect((e as Error).message).not.toContain('Quillfeather')
      expect(s.realTell).not.toHaveBeenCalled()
    }
  })

  it('accepts a message of exactly the maximum', async () => {
    const s = setup(keys)
    await s.ai.tellPip('x'.repeat(CORRECTION_MAX))
    expect(s.realTell).toHaveBeenCalledOnce()
  })

  it('joins a double send and refuses a different message while one runs', async () => {
    const s = setup(keys)
    let finish!: (v: { reply: string; why: string; note: null }) => void
    s.realTell.mockReturnValueOnce(new Promise((a) => (finish = a)))
    const first = s.ai.tellPip('same')
    const again = s.ai.tellPip('same')
    await expect(s.ai.tellPip('other')).rejects.toThrow(/still working/)
    finish({ reply: 'late', why: 'w', note: null })
    expect(await first).toEqual(await again)
    expect(s.realTell).toHaveBeenCalledOnce()
  })
})

describe('rememberCorrection', () => {
  it('uses the real rememberer with a key and the fixture without one', async () => {
    const s = setup({ ANTHROPIC_API_KEY: 'k' })
    expect(await s.ai.rememberCorrection('msg', 'said')).toBeNull()
    expect(s.realRemember).toHaveBeenCalledWith('msg', 'said')
    expect((await setup({}).ai.rememberCorrection('msg', 'said'))?.kind).toBe('add')
  })

  it('checks what the renderer sends', async () => {
    const s = setup({ ANTHROPIC_API_KEY: 'k' })
    await expect(s.ai.rememberCorrection('', 'said')).rejects.toThrow()
    await expect(s.ai.rememberCorrection('msg', 1 as never)).rejects.toThrow(/correction/)
    await expect(s.ai.rememberCorrection('msg', 'x'.repeat(1001))).rejects.toThrow(/correction/)
    expect(s.realRemember).not.toHaveBeenCalled()
  })
})

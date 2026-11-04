import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// A clipboard with several formats, as Electron's: text is one of them.
const board = vi.hoisted(() => ({
  items: [] as { types: string[]; data: Record<string, string> }[],
  copy: (() => {}) as () => void
}))

vi.mock('electron', () => {
  class ClipboardItem {
    types: string[]
    constructor(public data: Record<string, string>) {
      this.types = Object.keys(data)
    }
    getType = async (type: string): Promise<string> => this.data[type]
  }
  return {
    ClipboardItem,
    clipboard: {
      read: async () => board.items.map((i) => new ClipboardItem(i.data)),
      write: async (items: ClipboardItem[]) => {
        board.items = items.map((i) => ({ types: i.types, data: i.data }))
      },
      clear: () => {
        board.items = []
      },
      readText: async () => board.items[0]?.data['text/plain'] ?? ''
    }
  }
})

vi.mock('child_process', () => ({
  execFile: (_file: string, _args: string[], _opts: unknown, done: (e: unknown) => void) => {
    try {
      board.copy()
      done(null)
    } catch (err) {
      done(err)
    }
  }
}))

import { captureSelection, unseenPrimary } from './capture'

const put = (data: Record<string, string>): void => {
  board.items = [{ types: Object.keys(data), data }]
}

describe('captureSelection on Windows', () => {
  const platform = process.platform
  const rich = { 'text/plain': 'old copy', 'text/html': '<b>old copy</b>', 'image/png': 'pixels' }

  beforeEach(() => {
    Object.defineProperty(process, 'platform', { value: 'win32' })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: platform })
    vi.restoreAllMocks()
  })

  it('returns the selection and puts the clipboard back, every format included', async () => {
    put(rich)
    board.copy = () => put({ 'text/plain': 'selected words' })
    const result = await captureSelection()
    expect(result).toMatchObject({ text: 'selected words', copyFailed: false })
    expect(board.items[0].data).toEqual(rich)
  })

  it('with nothing selected returns no text, never the old clipboard, and restores it', async () => {
    put(rich)
    board.copy = () => {}
    const result = await captureSelection()
    expect(result).toMatchObject({ text: '', copyFailed: false })
    expect(board.items[0].data).toEqual(rich)
  })

  it('says so when the copy could not be simulated, and restores the clipboard', async () => {
    put(rich)
    board.copy = () => {
      throw new Error('no permission')
    }
    const result = await captureSelection()
    expect(result).toEqual({ text: '', copyFailed: true })
    expect(board.items[0].data).toEqual(rich)
  })

  it('leaves an empty clipboard empty', async () => {
    board.items = []
    board.copy = () => put({ 'text/plain': 'selected words' })
    expect((await captureSelection()).text).toBe('selected words')
    expect(board.items).toEqual([])
  })
})

describe('unseenPrimary', () => {
  it('reads new text, treats it unchanged as nothing selected, then reads it again', () => {
    const first = unseenPrimary('hello', '')
    expect(first).toEqual({ text: 'hello', last: 'hello' })
    const second = unseenPrimary('hello', first.last)
    expect(second).toEqual({ text: '', last: '' })
    expect(unseenPrimary('hello', second.last)).toEqual({ text: 'hello', last: 'hello' })
  })

  it('reads a different selection straight away', () => {
    expect(unseenPrimary('other', 'hello')).toEqual({ text: 'other', last: 'other' })
  })

  it('with nothing selected returns nothing and forgets the last text', () => {
    expect(unseenPrimary('', 'hello')).toEqual({ text: '', last: '' })
  })
})

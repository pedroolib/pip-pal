import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// A clipboard with several formats, as Electron's: text is one of them.
const board = vi.hoisted(() => ({
  items: [] as { types: string[]; data: Record<string, string> }[],
  copy: (() => {}) as () => void,
  /** What the script prints; the last script run. */
  stdout: '',
  script: ''
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
  execFile: (
    _file: string,
    args: string[],
    _opts: unknown,
    done: (e: unknown, out?: { stdout: string }) => void
  ) => {
    try {
      board.script = Buffer.from(args[args.length - 1], 'base64').toString('utf16le')
      board.copy()
      done(null, { stdout: board.stdout })
    } catch (err) {
      done(err)
    }
  }
}))

import { captureSelection, isTerminal, TERMINALS, unseenPrimary } from './capture'

const put = (data: Record<string, string>): void => {
  board.items = [{ types: Object.keys(data), data }]
}

describe('captureSelection on Windows', () => {
  const platform = process.platform
  const rich = { 'text/plain': 'old copy', 'text/html': '<b>old copy</b>', 'image/png': 'pixels' }

  beforeEach(() => {
    Object.defineProperty(process, 'platform', { value: 'win32' })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    board.stdout = ''
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

describe('a terminal in front on Windows', () => {
  const platform = process.platform
  const rich = { 'text/plain': 'old copy', 'text/html': '<b>old copy</b>' }

  beforeEach(() => {
    Object.defineProperty(process, 'platform', { value: 'win32' })
    board.stdout = ''
    put(rich)
  })
  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: platform })
    vi.restoreAllMocks()
  })

  it.each([
    'WindowsTerminal',
    'OpenConsole',
    'conhost',
    'cmd',
    'powershell',
    'pwsh',
    'wezterm-gui',
    'alacritty',
    'mintty',
    'ConEmu',
    'ConEmu64',
    'Hyper',
    'Tabby'
  ])('%s is a terminal, in any case', (name) => {
    expect(isTerminal(name)).toBe(true)
    expect(isTerminal(name.toUpperCase())).toBe(true)
  })

  it.each(['Code', 'notepad', 'chrome', 'WINWORD', 'cmdline', ''])('"%s" is not', (name) => {
    expect(isTerminal(name)).toBe(false)
  })

  it('the script decides before any key goes down, with the same list', async () => {
    board.copy = () => {}
    await captureSelection()
    const skip = board.script.indexOf('exit 0')
    expect(skip).toBeGreaterThan(-1)
    expect(skip).toBeLessThan(board.script.indexOf('keybd_event(0x11, 0, 0'))
    expect(board.script.indexOf('[Pip.Keys]::GetForegroundWindow()')).toBeLessThan(skip)
    for (const name of TERMINALS) expect(board.script).toContain(`'${name}'`)
  })

  it('returns no text without waiting for the clipboard, and restores it', async () => {
    board.stdout = 'front:WindowsTerminal\r\n'
    // Something on the clipboard would be read if Pip looked: it must not look.
    board.copy = () => put({ 'text/plain': 'not a selection' })
    expect(await captureSelection()).toEqual({ text: '', copyFailed: false })
    expect(board.items[0].data).toEqual(rich)
  })

  it('does not spend the clipboard poll on a terminal', async () => {
    board.stdout = 'front:cmd\r\n'
    board.copy = () => {}
    const started = Date.now()
    await captureSelection()
    expect(Date.now() - started).toBeLessThan(400)
  })

  it('an app that is not a terminal is read as before', async () => {
    board.stdout = 'front:notepad\r\n'
    board.copy = () => put({ 'text/plain': 'selected words' })
    expect((await captureSelection()).text).toBe('selected words')
  })

  it('a process Pip could not name is read as before', async () => {
    board.stdout = 'front:\r\n'
    board.copy = () => put({ 'text/plain': 'selected words' })
    expect((await captureSelection()).text).toBe('selected words')
  })
})

describe('a clipboard that cannot be restored', () => {
  it('still returns what was read', async () => {
    const platform = process.platform
    Object.defineProperty(process, 'platform', { value: 'win32' })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { clipboard } = await import('electron')
    const write = vi.spyOn(clipboard, 'write').mockRejectedValueOnce(new Error('locked'))
    put({ 'text/plain': 'old copy' })
    board.stdout = ''
    board.copy = () => put({ 'text/plain': 'selected words' })
    expect((await captureSelection()).text).toBe('selected words')
    expect(write).toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
    Object.defineProperty(process, 'platform', { value: platform })
    vi.restoreAllMocks()
  })
})

describe('unseenPrimary', () => {
  it('reads new text once; unchanged it stays nothing selected, press after press', () => {
    const first = unseenPrimary('hello', '')
    expect(first).toEqual({ text: 'hello', last: 'hello' })
    const second = unseenPrimary('hello', first.last)
    expect(second).toEqual({ text: '', last: 'hello' })
    const third = unseenPrimary('hello', second.last)
    expect(third).toEqual({ text: '', last: 'hello' })
  })

  it('reads the same text again once it was gone in between', () => {
    const gone = unseenPrimary('', 'hello')
    expect(unseenPrimary('hello', gone.last)).toEqual({ text: 'hello', last: 'hello' })
  })

  it('reads a different selection straight away', () => {
    expect(unseenPrimary('other', 'hello')).toEqual({ text: 'other', last: 'other' })
  })

  it('with nothing selected returns nothing and forgets the last text', () => {
    expect(unseenPrimary('', 'hello')).toEqual({ text: '', last: '' })
  })
})

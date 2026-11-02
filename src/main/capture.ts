// Reads the text the person selected when they press the hotkey. Pip only ever sees this selection,
// never the screen or other apps on its own (docs/DECISIONS.md §5).
import { execFile } from 'child_process'
import { promisify } from 'util'
import { clipboard, ClipboardItem } from 'electron'

const run = promisify(execFile)

// JXA: wait up to 1 s for the person to let go of ⌃⇧ (otherwise the app gets ⌃⇧⌘C, which
// copies nothing), then press ⌘C in the app in front and print that app's name.
// 0x1E0000 = Shift, Control, Option, Command.
const COPY_WHEN_KEYS_RELEASED = `
ObjC.import('AppKit')
for (let i = 0; i < 100 && ($.NSEvent.modifierFlags & 0x1e0000); i++) delay(0.01)
Application('System Events').keystroke('c', { using: 'command down' })
$.NSWorkspace.sharedWorkspace.frontmostApplication.localizedName.js
`

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export interface Capture {
  text: string
  /** false when the selection couldn't be read and this is the last copied text instead. */
  fromSelection: boolean
  /** Mac only: the app ⌘C went to. If it is Pip (Electron while developing), Pip was in front. */
  app?: string
}

export async function captureSelection(): Promise<Capture> {
  if (process.platform === 'darwin') return captureMac()
  if (process.platform === 'linux') {
    return { text: await clipboard.selection.readText(), fromSelection: true }
  }
  // shortcut: Windows uses the last copied text until Ctrl+C is simulated (PowerShell SendKeys).
  return { text: await clipboard.readText(), fromSelection: false }
}

// Simulates ⌘C in the app in front, reads the clipboard and puts back what was there before.
// Needs Accessibility permission (Terminal's while developing, Pip's once packaged).
async function captureMac(): Promise<Capture> {
  const saved = await saveClipboard()
  const lastCopied = await clipboard.readText()
  clipboard.clear()
  try {
    const { stdout } = await run('osascript', ['-l', 'JavaScript', '-e', COPY_WHEN_KEYS_RELEASED])
    const app = stdout.trim()
    const text = await waitForText(500)
    // Empty clipboard: nothing was selected, so fall back to what the person copied last.
    return text
      ? { text, fromSelection: true, app }
      : { text: lastCopied, fromSelection: false, app }
  } catch (err) {
    console.warn(
      '[capture] Could not simulate ⌘C; using the last copied text. Allow Accessibility for Terminal (dev) or Pip.',
      err instanceof Error ? err.message : err
    )
    return { text: lastCopied, fromSelection: false }
  } finally {
    await restoreClipboard(saved)
  }
}

async function waitForText(timeoutMs: number): Promise<string> {
  for (let waited = 0; waited < timeoutMs; waited += 25) {
    const text = await clipboard.readText()
    if (text) return text
    await sleep(25)
  }
  return ''
}

// Copies every format out of the clipboard, so images and rich text survive the capture too.
async function saveClipboard(): Promise<ClipboardItem[]> {
  const items = await clipboard.read()
  return Promise.all(
    items.map(async (item) => {
      const entries = await Promise.all(
        item.types.map(async (type) => [type, await item.getType(type)] as const)
      )
      return new ClipboardItem(Object.fromEntries(entries))
    })
  )
}

async function restoreClipboard(saved: ClipboardItem[]): Promise<void> {
  if (saved.length) await clipboard.write(saved)
  else clipboard.clear()
}

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

// PowerShell: the same for Windows. Wait up to 1 s for Shift, Ctrl and Alt to be let go (otherwise
// the app gets Ctrl+Shift+C), then press Ctrl+C. SendKeys can't wait for keys, so call user32.
const COPY_WHEN_KEYS_RELEASED_WIN = `
Add-Type -Namespace Pip -Name Keys -MemberDefinition '
[DllImport("user32.dll")] public static extern short GetAsyncKeyState(int key);
[DllImport("user32.dll")] public static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);'
$held = { @(0x10, 0x11, 0x12 | Where-Object { [Pip.Keys]::GetAsyncKeyState($_) -lt 0 }).Count }
for ($i = 0; $i -lt 100 -and (& $held); $i++) { Start-Sleep -Milliseconds 10 }
[Pip.Keys]::keybd_event(0x11, 0, 0, [UIntPtr]::Zero)
[Pip.Keys]::keybd_event(0x43, 0, 0, [UIntPtr]::Zero)
[Pip.Keys]::keybd_event(0x43, 0, 2, [UIntPtr]::Zero)
[Pip.Keys]::keybd_event(0x11, 0, 2, [UIntPtr]::Zero)
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
    return { text: await readPrimaryLinux(), fromSelection: true }
  }
  return captureWindows()
}

// On native Wayland Electron reads the primary selection as empty, so ask wl-paste; fall back to
// Electron's (X11, XWayland, or wl-paste missing).
async function readPrimaryLinux(): Promise<string> {
  if (process.env['WAYLAND_DISPLAY']) {
    try {
      const { stdout } = await run('wl-paste', ['--primary', '--no-newline'], { timeout: 500 })
      if (stdout) return stdout
    } catch {
      // nothing selected, or wl-paste is not installed
    }
  }
  return clipboard.selection.readText()
}

// Simulates ⌘C in the app in front, reads the clipboard and puts back what was there before.
// Needs Accessibility permission (Terminal's while developing, Pip's once packaged).
function captureMac(): Promise<Capture> {
  return captureByCopy(
    async () =>
      (await run('osascript', ['-l', 'JavaScript', '-e', COPY_WHEN_KEYS_RELEASED])).stdout.trim(),
    'Could not simulate ⌘C; using the last copied text. Allow Accessibility for Terminal (dev) or Pip.'
  )
}

// Simulates Ctrl+C the same way; Windows needs no permission. -EncodedCommand (UTF-16LE base64)
// keeps the script's quotes intact.
function captureWindows(): Promise<Capture> {
  const encoded = Buffer.from(COPY_WHEN_KEYS_RELEASED_WIN, 'utf16le').toString('base64')
  return captureByCopy(async () => {
    await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
      timeout: 5000
    })
    return undefined
  }, 'Could not simulate Ctrl+C; using the last copied text.')
}

// `copy` presses the copy keys in the app in front and may return that app's name.
async function captureByCopy(
  copy: () => Promise<string | undefined>,
  failure: string
): Promise<Capture> {
  const saved = await saveClipboard()
  const lastCopied = await clipboard.readText()
  clipboard.clear()
  try {
    const app = await copy()
    const text = await waitForText(500)
    // Empty clipboard: nothing was selected, so fall back to what the person copied last.
    return text
      ? { text, fromSelection: true, app }
      : { text: lastCopied, fromSelection: false, app }
  } catch (err) {
    console.warn(`[capture] ${failure}`, err instanceof Error ? err.message : err)
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
  // An empty clipboard can come back as an item with no types, which ClipboardItem refuses to build.
  return Promise.all(
    items
      .filter((item) => item.types.length)
      .map(async (item) => {
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

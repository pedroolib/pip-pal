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

// In a terminal Ctrl+C interrupts what is running, and with nothing selected that press is the normal way to the menu.
// shortcut: VS Code's built-in terminal runs inside Code.exe and can't be told apart, so it still gets Ctrl+C; upgrade if a window can say what has focus inside it.
export const TERMINALS = [
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
]

/** `name`: a Windows process name, without ".exe". */
export const isTerminal = (name: string): boolean =>
  TERMINALS.some((t) => t.toLowerCase() === name.trim().toLowerCase())

// PowerShell: the same for Windows, after printing the process in front and stopping if it is a terminal. Wait up to
// 1 s for Shift, Ctrl and Alt to be let go (otherwise the app gets Ctrl+Shift+C), then press Ctrl+C. SendKeys can't
// wait for keys, so call user32. A process it can't name has its keys pressed, as any other app.
const COPY_WHEN_KEYS_RELEASED_WIN = `
Add-Type -Namespace Pip -Name Keys -MemberDefinition '
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
[DllImport("user32.dll")] public static extern short GetAsyncKeyState(int key);
[DllImport("user32.dll")] public static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);'
$process = [uint32]0
[void][Pip.Keys]::GetWindowThreadProcessId([Pip.Keys]::GetForegroundWindow(), [ref]$process)
$front = try { (Get-Process -Id $process -ErrorAction Stop).ProcessName } catch { '' }
Write-Output "front:$front"
if (@(${TERMINALS.map((t) => `'${t}'`).join(', ')}) -contains $front) { exit 0 }
$held = { @(0x10, 0x11, 0x12 | Where-Object { [Pip.Keys]::GetAsyncKeyState($_) -lt 0 }).Count }
for ($i = 0; $i -lt 100 -and (& $held); $i++) { Start-Sleep -Milliseconds 10 }
[Pip.Keys]::keybd_event(0x11, 0, 0, [UIntPtr]::Zero)
[Pip.Keys]::keybd_event(0x43, 0, 0, [UIntPtr]::Zero)
[Pip.Keys]::keybd_event(0x43, 0, 2, [UIntPtr]::Zero)
[Pip.Keys]::keybd_event(0x11, 0, 2, [UIntPtr]::Zero)
`

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export interface Capture {
  /** Empty when nothing was selected. */
  text: string
  /** The simulated copy threw, so an empty `text` says nothing about the selection. */
  copyFailed: boolean
  /** Mac only: the app ⌘C went to. If it is Pip (Electron while developing), Pip was in front. */
  app?: string
}

export async function captureSelection(): Promise<Capture> {
  if (process.platform === 'darwin') return captureMac()
  if (process.platform === 'linux') {
    const { text, last } = unseenPrimary(await readPrimaryLinux(), lastPrimary)
    lastPrimary = last
    return { text, copyFailed: false }
  }
  return captureWindows()
}

// shortcut: Linux keeps the primary selection after deselecting, so unchanged text counts as nothing selected until it
// changes, and selecting the same words again opens the menu; upgrade if compositors expose whether text is selected.
let lastPrimary = ''

/** What a press should read and what to remember for the next one. Old text is never sent again, however often it is pressed. */
export function unseenPrimary(current: string, last: string): { text: string; last: string } {
  return { text: current === last ? '' : current, last: current }
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
    'Could not simulate ⌘C, so the selection could not be read. Allow Accessibility for Terminal (dev) or Pip.'
  )
}

// Simulates Ctrl+C the same way; Windows needs no permission. -EncodedCommand (UTF-16LE base64)
// keeps the script's quotes intact.
function captureWindows(): Promise<Capture> {
  const encoded = Buffer.from(COPY_WHEN_KEYS_RELEASED_WIN, 'utf16le').toString('base64')
  return captureByCopy(async () => {
    const { stdout } = await run(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
      { timeout: 5000 }
    )
    return isTerminal(/^front:(.*)$/m.exec(stdout)?.[1] ?? '') ? null : undefined
  }, 'Could not simulate Ctrl+C, so the selection could not be read.')
}

// `copy` presses the copy keys in the app in front and may return that app's name; null means it pressed nothing.
async function captureByCopy(
  copy: () => Promise<string | undefined | null>,
  failure: string
): Promise<Capture> {
  const saved = await saveClipboard()
  clipboard.clear()
  try {
    const app = await copy()
    if (app === null) return { text: '', copyFailed: false }
    return { text: await waitForText(500), copyFailed: false, app }
  } catch (err) {
    console.warn(`[capture] ${failure}`, err instanceof Error ? err.message : err)
    return { text: '', copyFailed: true }
  } finally {
    // shortcut: an app that copies after the 500 ms poll still overwrites what was restored; leave it unless it shows up in use.
    await restoreClipboard(saved).catch((err) =>
      console.warn('[capture] Could not restore the clipboard.', err)
    )
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

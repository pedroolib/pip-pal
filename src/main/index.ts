import {
  app,
  shell,
  BrowserWindow,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  powerMonitor,
  screen,
  session,
  systemPreferences
} from 'electron'
import { execFile } from 'child_process'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { IPC, OVERLAY_MIN, type Bounds, type CornerPip } from '@shared/ipc'
import { enabledTimes, hotkeyReady } from '@shared/schemas'
import { captureSelection } from './capture'
import { isSafeExternalUrl } from './external-links'
import { parseCheckInTimes, startCheckInSchedule } from './check-in-schedule'
import { registerMockHandlers, warmUpTranscriber } from './mock'
import { startReminderSchedule } from './reminders'
import { openStorage } from './storage'

// Explicit Control: `CommandOrControl` would become ⌘ on Mac (docs/DECISIONS.md, notes for A).
// shortcut: fixed until there is a settings screen to change it.
const HOTKEY = 'Control+Shift+Space'

// One Pip at a time. Global shortcuts don't work on Wayland, so a compositor bind runs
// `pip-pal --capture`; that second launch only hands the request to this one and exits.
if (!app.requestSingleInstanceLock()) app.exit()

// Fits the task card (max-w-sm plus the p-8 that leaves room for its shadow).
const OVERLAY = { width: 576, height: 340, margin: 16 }
// The window's transparent padding (p-8) may go past the screen edge while dragging; the card may not.
const OVERLAY_PAD = 32

// Clicks on the overlay's transparent area go to the app underneath. `forward` keeps mouse moves
// reaching the renderer, which reports when the pointer is over Pip. Linux can't forward them, so
// there the whole window stays clickable.
const CLICK_THROUGH = process.platform !== 'linux'

let overlay: BrowserWindow | null = null
// What the overlay's page last told main; a replaced page starts over (resetOverlayPage).
let recordingActive = false
let overlayWantsKeyboard = false
// Reminders wait for this: sent before the page has subscribed, one would be lost.
let overlaySubscribed = false
// Where a press with a selection found the window, in case the overlay refuses the selection.
let beforeSelection: { bounds: Bounds; held: boolean } | null = null
let reminders: ReturnType<typeof startReminderSchedule> | null = null

// A reload, crash or new window can't send the "false" the old page owed, or the command would be stuck.
function resetOverlayPage(): void {
  recordingActive = false
  overlayWantsKeyboard = false
  overlaySubscribed = false
  beforeSelection = null
}

// The overlay's renderer is untrusted input like any IPC sender: check the shape before using it.
function isCornerPip(v: unknown): v is CornerPip {
  if (typeof v !== 'object' || v === null) return false
  const { holds, progress } = v as Record<string, unknown>
  return (
    (holds === 'menu' || holds === 'task') &&
    (progress === null || (typeof progress === 'number' && progress >= 0 && progress <= 1))
  )
}

// Keeps the window on the display's work area; only the transparent padding may go past the edge.
function clampBounds({ x, y, width, height }: Bounds): Bounds {
  const { workArea: wa } = screen.getDisplayNearestPoint({
    x: Math.round(x + width / 2),
    y: Math.round(y + height / 2)
  })
  const clamp = (v: number, min: number, max: number): number => Math.min(Math.max(v, min), max)
  const w = Math.round(clamp(width, OVERLAY_MIN.width, wa.width + 2 * OVERLAY_PAD))
  const h = Math.round(clamp(height, OVERLAY_MIN.height, wa.height + 2 * OVERLAY_PAD))
  return {
    x: Math.round(clamp(x, wa.x - OVERLAY_PAD, wa.x + wa.width - w + OVERLAY_PAD)),
    y: Math.round(clamp(y, wa.y - OVERLAY_PAD, wa.y + wa.height - h + OVERLAY_PAD)),
    width: w,
    height: h
  }
}

// shortcut: under Hyprland Electron reports a stale cursor, so ask the compositor; any failure falls back to Electron's.
function cursorPoint(): Promise<{ x: number; y: number }> {
  const fallback = screen.getCursorScreenPoint()
  if (process.platform !== 'linux' || !process.env['HYPRLAND_INSTANCE_SIGNATURE']) {
    return Promise.resolve(fallback)
  }
  return new Promise((resolve) => {
    execFile('hyprctl', ['cursorpos'], { timeout: 500 }, (err, stdout) => {
      const [x, y] = stdout.split(',').map((n) => Number.parseInt(n, 10))
      resolve(err || !Number.isFinite(x) || !Number.isFinite(y) ? fallback : { x, y })
    })
  })
}

// Esc is global only while the bubble is open: the overlay is never focused, so it can't hear keys,
// and a permanent Escape shortcut would steal it from every other app.
function setEscape(on: boolean): void {
  globalShortcut.unregister('Escape')
  if (!on) return
  globalShortcut.register('Escape', () => {
    globalShortcut.unregister('Escape')
    overlay?.webContents.send(IPC.dismiss)
  })
}

// Windows can put a window back on the taskbar whenever it is shown, so say again that it stays off.
function showPip(win: BrowserWindow): void {
  win.showInactive()
  // On Windows setSkipTaskbar can take focus away, so never while a card holds the keyboard.
  if (!win.isFocused()) win.setSkipTaskbar(true)
}

// Windows can refuse to hand the overlay the keyboard (a background app may not take focus), and then the arrow keys
// would drive the app underneath instead of the command menu. isFocused() can't tell: it may say true while the keys
// still go to the other app. So while the menu is open its keys are always caught globally, as Escape is.
// shortcut: they stay caught if the person moves to another app with the menu still open, until it closes; close the menu on a click outside if that bites.
const MENU_KEYS: Record<string, string> = {
  Up: 'ArrowUp',
  Down: 'ArrowDown',
  Home: 'Home',
  End: 'End',
  Enter: 'Enter',
  Tab: 'Tab',
  'Shift+Tab': 'Shift+Tab'
}
function setMenuKeys(on: boolean): void {
  for (const accel of Object.keys(MENU_KEYS)) globalShortcut.unregister(accel)
  if (!on) return
  for (const [accel, key] of Object.entries(MENU_KEYS)) {
    globalShortcut.register(accel, () => overlay?.webContents.send(IPC.menuKey, key))
  }
}

// The overlay: transparent, frameless and docked bottom-right, floating over every app.
function createOverlay(): void {
  const { workArea } = screen.getPrimaryDisplay()
  const mainWindow = new BrowserWindow({
    width: OVERLAY.width,
    height: OVERLAY.height,
    x: workArea.x + workArea.width - OVERLAY.width - OVERLAY.margin,
    y: workArea.y + workArea.height - OVERLAY.height - OVERLAY.margin,
    show: false,
    transparent: true,
    frame: false,
    // The card draws its own shadow; the OS one would outline the empty part of the window.
    hasShadow: false,
    resizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    autoHideMenuBar: true,
    // Clicking or dragging Pip must not take the keyboard: the hotkey's ⌘C has to reach the app with
    // the selection. It is focusable only while a record card needs the keyboard (IPC.overlayFocus).
    focusable: false,
    // macOS: a non-activating panel is what reliably floats over other apps' full-screen Spaces;
    // setVisibleOnAllWorkspaces alone only works some of the time.
    ...(process.platform === 'darwin' ? { type: 'panel' } : {}),
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  // Above everything, including apps in full screen (docs/DECISIONS.md, notes for A).
  mainWindow.setAlwaysOnTop(true, 'screen-saver')
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  if (CLICK_THROUGH) mainWindow.setIgnoreMouseEvents(true, { forward: true })

  overlay = mainWindow
  mainWindow.on('closed', () => {
    overlay = null
    setEscape(false)
    setMenuKeys(false)
    setCorner(null)
    resetOverlayPage()
  })
  // A reload or crash skips React's cleanup, so the bubble could never release the shortcut.
  mainWindow.webContents.on('render-process-gone', () => {
    setEscape(false)
    setMenuKeys(false)
    resetOverlayPage()
  })
  mainWindow.webContents.on('did-start-navigation', (_e, _url, _inPlace, isMainFrame) => {
    if (!isMainFrame) return
    setEscape(false)
    setMenuKeys(false)
    setCorner(null) // the reloaded overlay has no task open
    resetOverlayPage()
  })

  // The renderer paints the cream app background. Clearing it here keeps it for the plain browser
  // and for the Casa de Pip window, which load the same page.
  mainWindow.webContents.on('dom-ready', () => {
    mainWindow.webContents.insertCSS('body { background: transparent !important; }')
  })

  // showInactive: Pip appearing must not steal focus from the app the person is working in.
  mainWindow.on('ready-to-show', () => {
    showPip(mainWindow)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (isSafeExternalUrl(details.url)) shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// The corner Pip: a window just big enough for Pip and its progress ring, bottom-right of the
// screen the overlay is on. It holds whatever of the task isn't at the cursor (CornerPip).
const CORNER = { size: 80, margin: 16 }
let corner: BrowserWindow | null = null
let cornerState: CornerPip | null = null

function createCorner(): void {
  const win = new BrowserWindow({
    width: CORNER.size,
    height: CORNER.size,
    show: false,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    autoHideMenuBar: true,
    // Same as the overlay: clicking Pip must not take focus from the app the person works in.
    focusable: false,
    ...(process.platform === 'darwin' ? { type: 'panel' } : {}),
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  corner = win
  win.on('closed', () => (corner = null))
  win.webContents.on('dom-ready', () => {
    win.webContents.insertCSS('body { background: transparent !important; }')
  })
  // A reload starts empty: hand it what it held.
  win.webContents.on('did-finish-load', () => win.webContents.send(IPC.corner, cornerState))
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/corner`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/corner' })
  }
}

function setCorner(state: CornerPip | null): void {
  cornerState = state
  const win = corner
  if (!win) return
  win.webContents.send(IPC.corner, state)
  if (!state) {
    win.hide()
    return
  }
  const near = overlay?.getBounds() ?? screen.getCursorScreenPoint()
  const { workArea: wa } = screen.getDisplayNearestPoint({ x: near.x, y: near.y })
  win.setBounds({
    x: wa.x + wa.width - CORNER.size - CORNER.margin,
    y: wa.y + wa.height - CORNER.size - CORNER.margin,
    width: CORNER.size,
    height: CORNER.size
  })
  showPip(win)
}

// The overlay is unfocusable except while a record card needs the keyboard (IPC.overlayFocus).
function setOverlayFocus(win: BrowserWindow, on: boolean): void {
  // Windows puts the window back on the taskbar when it becomes focusable; say so before focusing, because
  // setSkipTaskbar can take the focus away.
  if (on) {
    win.setFocusable(true)
    win.setSkipTaskbar(true)
    win.focus()
    win.webContents.focus() // the page itself, or the arrow keys still go to the app underneath
  } else {
    win.blur()
    win.setFocusable(false)
    win.setSkipTaskbar(true)
  }
}

// The bubble opens next to the cursor, its card just inside the transparent padding. Not clamped: the
// renderer reads the cursor back from this position and fits the bubble on screen itself, opening it
// left or up near an edge (CURSOR_GAP in Overlay.tsx).
async function moveToCursor(win: BrowserWindow): Promise<void> {
  const cursor = await cursorPoint()
  const { width, height } = win.getBounds()
  win.setBounds({ x: cursor.x + 12 - OVERLAY_PAD, y: cursor.y + 12 - OVERLAY_PAD, width, height })
  showPip(win)
}

// shortcut: the overlay window stays shown with nothing drawn, so a card counts as open while it holds the keyboard, even
// one that lost it to another app (the next press then opens the menu where it sits); upgrade if the overlay reports its view.
const cardOpen = (): boolean => overlayWantsKeyboard

// The one command. A recording always stops, without touching the selection. Otherwise it reads the
// selection: text goes to triage, and with none the overlay decides what the press means. Ignores
// presses while one is reading.
let capturing = false
async function command(): Promise<void> {
  if (recordingActive) {
    overlay?.webContents.send(IPC.recordHotkey)
    return
  }
  if (capturing) return
  capturing = true
  // A card may hold the keyboard: give it back first, or the copy keys land in Pip itself.
  const held = !!overlay?.isFocused()
  if (held) setOverlayFocus(overlay!, false)
  const before = overlay && { bounds: overlay.getBounds(), held }
  // Closed: Pip appears reading at once, as the answer to the press; the result then shows the bubble or the menu.
  // An open card stays as it is until the read says what the press means.
  const early = !!overlay && !cardOpen()
  let settled = false
  if (early) {
    const win = overlay!
    void moveToCursor(win).then(() => settled || win.webContents.send(IPC.commandStart))
  }
  try {
    const { text, copyFailed, app: from } = await captureSelection()
    settled = true
    if (is.dev) {
      // Only a preview, so the terminal doesn't fill with whole messages.
      const where = from ? ` (⌘C went to ${from})` : ''
      console.log(`[capture]${where} ${text.length} chars: ${text.slice(0, 80)}…`)
    }
    const win = overlay
    if (!win) return
    if (!text.trim()) {
      // Nothing to read, so an open card stays and needs its keyboard back.
      if (held) setOverlayFocus(win, true)
      if (!early && !cardOpen()) await moveToCursor(win)
      win.webContents.send(IPC.command, { copyFailed })
      return
    }
    beforeSelection = before ?? null
    await moveToCursor(win)
    win.webContents.send(IPC.captured, text)
  } finally {
    capturing = false
  }
}

// `pip-pal --record`: open the overlay at the cursor (unless a press that stops the recording or an open
// card must keep it where it is) and tell it. Pip never starts recording by itself.
async function record(): Promise<void> {
  const win = overlay
  if (!win) return
  if (!recordingActive && !cardOpen()) await moveToCursor(win)
  win.webContents.send(IPC.recordHotkey)
}

// Audio only, and only for the overlay and the House: the mic through getUserMedia, computer audio through
// getDisplayMedia. Other permissions keep Electron's default (allowed); any other media is denied.
function setMediaPermissions(): void {
  const ses = session.defaultSession
  // The House (onboarding, My Manual) dictates into its fields with the mic too; it never gets computer audio.
  const fromOverlay = (wc: Electron.WebContents | null): boolean =>
    (!!overlay && wc === overlay.webContents) ||
    (!!home && !home.isDestroyed() && wc === home.webContents)
  ses.setPermissionCheckHandler((wc, permission, _origin, details) => {
    if (permission !== 'media') return true
    return fromOverlay(wc) && (details as { mediaType?: string }).mediaType === 'audio'
  })
  ses.setPermissionRequestHandler(async (wc, permission, callback, details) => {
    if (permission !== 'media') return callback(true)
    const types = (details as { mediaTypes?: string[] }).mediaTypes ?? []
    if (!fromOverlay(wc) || types.length === 0 || types.some((t) => t !== 'audio')) {
      return callback(false)
    }
    // macOS asks for the microphone once, the first time the person starts recording.
    if (
      process.platform === 'darwin' &&
      systemPreferences.getMediaAccessStatus('microphone') !== 'granted'
    ) {
      return callback(await systemPreferences.askForMediaAccess('microphone').catch(() => false))
    }
    callback(true)
  })
  // Computer audio is loopback on a screen source; the renderer drops the video track.
  ses.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      // Only the overlay page itself, and only when it asks for audio (the video is just the carrier).
      if (!overlay || request.frame !== overlay.webContents.mainFrame || !request.audioRequested) {
        return callback(null)
      }
      const [source] = await desktopCapturer.getSources({ types: ['screen'] })
      callback(source ? { video: source, audio: 'loopback' } : null)
    } catch {
      callback(null)
    }
  })
}

// Pip's House: a normal opaque window (My Manual, later summaries and settings).
let home: BrowserWindow | null = null
function openHome(): void {
  if (home && !home.isDestroyed()) {
    if (home.isMinimized()) home.restore()
    home.show()
    home.focus()
    return
  }
  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 420,
    minHeight: 600,
    title: "Pip's House",
    backgroundColor: '#f2efe7',
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })
  home = win
  // Keep the title "Pip's House" instead of the page <title>.
  win.on('page-title-updated', (e) => e.preventDefault())
  win.on('closed', () => {
    if (home === win) home = null
  })
  win.webContents.setWindowOpenHandler((details) => {
    if (isSafeExternalUrl(details.url)) shell.openExternal(details.url)
    return { action: 'deny' }
  })
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/home`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/home' })
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('mx.pip.app')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  if (!app.isPackaged) {
    try {
      process.loadEnvFile() // dev: keys and PIP_DEMO from .env (gitignored); existing env vars win
    } catch {
      // no .env: keys, if any, come from the environment
    }
  }
  const storage = openStorage()
  // Until onboarding reaches its practice step, the hotkey and check-ins stay quiet (demo: always on).
  const ready = (): boolean => storage.demo || hotkeyReady(storage.settings.load().onboarding)
  // Launch at login keeps reminders alive after a reboot. Packaged app only: in dev it would register Electron itself.
  const applyLogin = (): void => {
    if (!app.isPackaged) return
    const on = ready() && (storage.settings.load().launchAtLogin ?? true)
    app.setLoginItemSettings({ openAtLogin: on })
  }
  // A saved change to the check-in times re-arms the schedule (created below) without a restart.
  // It may also be the save that ends onboarding's quiet, which reminders wait for.
  registerMockHandlers(
    storage,
    () => {
      checkIns.reschedule()
      reminders?.refresh()
      applyLogin()
    },
    (wc) => wc === overlay?.webContents,
    () => reminders?.refresh()
  )

  ipcMain.on(IPC.overlayInteractive, (event, interactive: boolean) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!CLICK_THROUGH || !win || win !== overlay) return
    win.setIgnoreMouseEvents(!interactive, { forward: true })
  })

  // Dragging a card or Pip moves the overlay; dragging a card's edge resizes it. A transparent window
  // can't use the OS resize or CSS drag regions (they'd swallow the mouse moves click-through needs),
  // so the renderer sends the bounds it wants and this keeps them sane.
  ipcMain.on(IPC.overlayBounds, (event, b: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win !== overlay || typeof b !== 'object' || b === null) return
    const { x, y, width, height } = b as Record<string, unknown>
    const nums = [x, y, width, height]
    if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) return
    const [bx, by, bw, bh] = nums as number[]
    win.setBounds(clampBounds({ x: bx, y: by, width: bw, height: bh }))
  })

  ipcMain.on(IPC.menuKeysWanted, (event, wanted: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win !== overlay || typeof wanted !== 'boolean') return
    setMenuKeys(wanted)
  })

  ipcMain.on(IPC.bubbleOpen, (event, open: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win !== overlay || typeof open !== 'boolean') return
    setEscape(open)
  })

  // The record cards with a text field or an Enter key need the keyboard; everywhere else the overlay
  // stays unfocusable. No global Enter: once focused, the page hears its own keys.
  ipcMain.on(IPC.overlayFocus, (event, on: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win !== overlay || typeof on !== 'boolean') return
    overlayWantsKeyboard = on
    setOverlayFocus(win, on)
  })

  // Tells the command that its press means "stop", before it would touch the selection.
  ipcMain.on(IPC.recordingActive, (event, on: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win !== overlay || typeof on !== 'boolean') return
    recordingActive = on
  })

  // The overlay has subscribed: send what it would have missed. A reload clears this and it says so again.
  ipcMain.on(IPC.overlayReady, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win !== overlay) return
    overlaySubscribed = true
    reminders?.redeliver()
  })

  // Typed text would be lost, so the press means nothing: the card goes back where it was, with the keyboard if it had it.
  ipcMain.on(IPC.selectionRefused, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win !== overlay || !beforeSelection) return
    win.setBounds(beforeSelection.bounds)
    if (beforeSelection.held) setOverlayFocus(win, true)
    beforeSelection = null
  })

  // Only the overlay sets the corner Pip; its click goes back to the overlay to swap.
  ipcMain.on(IPC.cornerSet, (event, state: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win !== overlay) return
    setCorner(isCornerPip(state) ? state : null)
  })
  ipcMain.on(IPC.cornerClick, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win !== corner) return
    overlay?.webContents.send(IPC.cornerOpen)
  })

  createOverlay()
  createCorner()
  // Spoons check-ins at the enabled times from Settings. Shown without taking focus, like a
  // captured message. The dev override wins over Settings.
  const devTimes = is.dev ? parseCheckInTimes(process.env['PIP_CHECK_IN_TIMES']) : undefined
  const checkIns = startCheckInSchedule({
    listCheckIns: () => storage.checkIns.list(),
    onDue: (slot) => {
      if (!ready()) return
      if (is.dev) console.log(`[check-in] ${slot} is due`)
      const win = overlay
      if (!win) return
      showPip(win)
      win.webContents.send(IPC.checkInDue, slot)
    },
    times: () => devTimes ?? enabledTimes(storage.settings.load())
  })
  powerMonitor.on('resume', checkIns.resume)
  app.on('will-quit', checkIns.stop)
  // The list reads empty until the overlay can show a reminder and onboarding allows it, so none is
  // used up early; IPC.overlayReady and the settings save above check again.
  const schedule = startReminderSchedule({
    list: () => (overlaySubscribed && ready() ? storage.reminders.list() : []),
    onDue: (reminder) => {
      const win = overlay
      if (!win) return
      showPip(win)
      win.webContents.send(IPC.reminderDue, reminder)
    }
  })
  reminders = schedule
  powerMonitor.on('resume', schedule.refresh)
  applyLogin()
  app.on('will-quit', schedule.stop)
  if (
    !globalShortcut.register(HOTKEY, () => {
      if (ready()) void command()
    })
  ) {
    console.warn(`[capture] ${HOTKEY} is taken by another app; use \`pip-pal --capture\` instead.`)
  }
  setMediaPermissions()
  // Load the speech model before the first recording needs it.
  setTimeout(() => void warmUpTranscriber(), 3000)
  app.on('second-instance', (_, argv) => {
    if (argv.includes('--capture') && ready()) void command()
    if (argv.includes('--record') && ready()) void record()
    if (argv.includes('--dismiss')) overlay?.webContents.send(IPC.dismiss)
  })
  ipcMain.on(IPC.homeOpen, openHome)
  // shortcut: opened at launch until the tray/hotkey opens it; replace when the shell lands
  openHome()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createOverlay()
      createCorner()
      openHome()
    }
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => globalShortcut.unregisterAll())

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

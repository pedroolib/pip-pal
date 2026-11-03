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
import { openStorage } from './storage'

// Explicit Control: `CommandOrControl` would become ⌘ on Mac (docs/DECISIONS.md, notes for A).
// shortcut: fixed until there is a settings screen to change it.
const HOTKEY = 'Control+Shift+Space'
// Starts and stops voice capture in the overlay (the renderer decides which).
const RECORD_HOTKEY = 'Control+Shift+Enter'

// One Pip at a time. Global shortcuts don't work on Wayland, so a compositor bind runs
// `pip-pal --capture`; that second launch only hands the request to this one and exits.
if (!app.requestSingleInstanceLock()) app.exit()

// Fits the task card (max-w-sm plus the p-8 that leaves room for its shadow).
const OVERLAY = { width: 448, height: 400, margin: 16 }
// The window's transparent padding (p-8) may go past the screen edge while dragging; the card may not.
const OVERLAY_PAD = 32

// Clicks on the overlay's transparent area go to the app underneath. `forward` keeps mouse moves
// reaching the renderer, which reports when the pointer is over Pip. Linux can't forward them, so
// there the whole window stays clickable.
const CLICK_THROUGH = process.platform !== 'linux'

let overlay: BrowserWindow | null = null

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
    setCorner(null)
  })
  // A reload or crash skips React's cleanup, so the bubble could never release the shortcut.
  mainWindow.webContents.on('render-process-gone', () => setEscape(false))
  mainWindow.webContents.on('did-start-navigation', (_e, _url, _inPlace, isMainFrame) => {
    if (!isMainFrame) return
    setEscape(false)
    setCorner(null) // the reloaded overlay has no task open
  })

  // The renderer paints the cream app background. Clearing it here keeps it for the plain browser
  // and for the Casa de Pip window, which load the same page.
  mainWindow.webContents.on('dom-ready', () => {
    mainWindow.webContents.insertCSS('body { background: transparent !important; }')
  })

  // showInactive: Pip appearing must not steal focus from the app the person is working in.
  mainWindow.on('ready-to-show', () => {
    mainWindow.showInactive()
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
  win.showInactive()
}

// Hotkey pressed: read the selection and hand it to the overlay. Ignores presses while one is running.
let capturing = false
async function capture(): Promise<void> {
  if (capturing) return
  capturing = true
  try {
    const { text, fromSelection, app: from } = await captureSelection()
    if (is.dev) {
      // Only a preview, so the terminal doesn't fill with whole messages.
      const source = fromSelection ? 'selection' : 'last copied'
      const where = from ? ` (⌘C went to ${from})` : ''
      console.log(`[capture] ${source}${where}, ${text.length} chars: ${text.slice(0, 80)}…`)
    }
    const win = overlay
    if (!text.trim() || !win) return
    // The bubble opens next to the cursor, its card just inside the transparent padding. Not clamped:
    // the renderer reads the cursor back from this position and fits the bubble on screen itself,
    // opening it left or up near an edge (CURSOR_GAP in Overlay.tsx).
    const cursor = await cursorPoint()
    const { width, height } = win.getBounds()
    win.setBounds({ x: cursor.x + 12 - OVERLAY_PAD, y: cursor.y + 12 - OVERLAY_PAD, width, height })
    win.showInactive()
    win.webContents.send(IPC.captured, text)
  } finally {
    capturing = false
  }
}

// Record hotkey pressed: open the overlay at the cursor (unless it is already showing, so a second
// press that stops the recording doesn't move it) and tell it. Pip never starts recording by itself.
async function record(): Promise<void> {
  const win = overlay
  if (!win) return
  if (!win.isVisible()) {
    const cursor = await cursorPoint()
    const { width, height } = win.getBounds()
    win.setBounds({ x: cursor.x + 12 - OVERLAY_PAD, y: cursor.y + 12 - OVERLAY_PAD, width, height })
    win.showInactive()
  }
  win.webContents.send(IPC.recordHotkey)
}

// Audio only, and only for the overlay: the mic through getUserMedia, computer audio through
// getDisplayMedia. Other permissions keep Electron's default (allowed); any other media is denied.
function setMediaPermissions(): void {
  const ses = session.defaultSession
  const fromOverlay = (wc: Electron.WebContents | null): boolean =>
    !!overlay && wc === overlay.webContents
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
  // A saved change to the check-in times re-arms the schedule (created below) without a restart.
  registerMockHandlers(
    storage,
    () => checkIns.reschedule(),
    (wc) => wc === overlay?.webContents
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
    if (on) {
      win.setFocusable(true)
      win.focus()
    } else {
      win.blur()
      win.setFocusable(false)
    }
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
      win.showInactive()
      win.webContents.send(IPC.checkInDue, slot)
    },
    times: () => devTimes ?? enabledTimes(storage.settings.load())
  })
  powerMonitor.on('resume', checkIns.resume)
  app.on('will-quit', checkIns.stop)
  if (
    !globalShortcut.register(HOTKEY, () => {
      if (ready()) void capture()
    })
  ) {
    console.warn(`[capture] ${HOTKEY} is taken by another app; use \`pip-pal --capture\` instead.`)
  }
  if (
    !globalShortcut.register(RECORD_HOTKEY, () => {
      if (ready()) void record()
    })
  ) {
    console.warn(
      `[record] ${RECORD_HOTKEY} is taken by another app; use \`pip-pal --record\` instead.`
    )
  }
  setMediaPermissions()
  // Load the speech model before the first recording needs it.
  setTimeout(() => void warmUpTranscriber(), 3000)
  app.on('second-instance', (_, argv) => {
    if (argv.includes('--capture') && ready()) void capture()
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

/* eslint-disable @typescript-eslint/explicit-function-return-type -- plain JS script, no types to annotate */
// Regenerates the screenshots and GIFs the README shows, in docs/images/. It opens the built renderer in an
// offscreen Electron window with no preload, so the app runs on the demo fixtures (src/shared/mock-api.ts):
// no keys, no network, nothing from a real person.
//   npm run build && npx electron scripts/readme-media.mjs
import { app, BrowserWindow, nativeTheme } from 'electron'
import sharp from 'sharp'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const PAGE = join(ROOT, 'out', 'renderer', 'index.html')
const OUT = join(ROOT, 'docs', 'images')
const SCALE = 2 // capture at 2x so text stays sharp
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function open({ w = 800, h = 780, query = {}, hash = '', dark = false }) {
  nativeTheme.themeSource = dark ? 'dark' : 'light'
  const win = new BrowserWindow({
    width: w,
    height: Math.min(h, 700),
    useContentSize: true,
    show: false,
    webPreferences: { offscreen: true, backgroundThrottling: false }
  })
  await win.loadFile(PAGE, { query, hash })
  // The page must see a w x h viewport at SCALE pixels per CSS pixel, whatever the screen or the display scale. Chromium
  // divides the emulated size by a factor that varies by window, so it is measured and corrected until the page agrees.
  const dbg = win.webContents.debugger
  dbg.attach('1.3')
  let factor = 1
  for (let i = 0; i < 4; i++) {
    await dbg.sendCommand('Emulation.setDeviceMetricsOverride', {
      width: Math.round(w * factor),
      height: Math.round(h * factor),
      deviceScaleFactor: SCALE / factor,
      mobile: false
    })
    await sleep(250)
    const [iw, dpr] = await win.webContents.executeJavaScript('[innerWidth, devicePixelRatio]')
    if (iw === w && Math.abs(dpr - SCALE) < 0.01) break
    if (i === 3) throw new Error(`could not size the viewport: ${iw} wide at ${dpr}x`)
    factor = (factor * w) / iw
  }
  const run = (code) => win.webContents.executeJavaScript(code, true)
  const waitFor = async (cond, ms = 10000) => {
    const start = Date.now()
    while (Date.now() - start < ms) {
      if (await run(`!!(${cond})`).catch(() => false)) return
      await sleep(100)
    }
    throw new Error(`timed out waiting for: ${cond}`)
  }
  const hasText = (t) => `document.body.innerText.includes(${JSON.stringify(t)})`
  const click = (label) =>
    run(`(() => {
      const label = ${JSON.stringify(label)}
      const els = [...document.querySelectorAll('*')].filter(
        (e) => e.textContent.trim().startsWith(label) && ![...e.children].some((c) => c.textContent.trim().startsWith(label))
      )
      const el = els.at(-1)
      if (!el) throw new Error('nothing to click: ' + label)
      el.click()
    })()`)
  const clickSel = (sel) =>
    run(
      `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error('no ' + ${JSON.stringify(sel)}); el.click() })()`
    )
  const rectOf = (sel) =>
    run(
      `(() => { const r = document.querySelector(${JSON.stringify(sel)})?.getBoundingClientRect(); return r && { x: r.x, y: r.y, w: r.width, h: r.height } })()`
    )
  // The whole viewport, as a PNG buffer at 2x.
  const grab = async () =>
    Buffer.from((await dbg.sendCommand('Page.captureScreenshot', { format: 'png' })).data, 'base64')
  // Cut a region given in CSS pixels, clamped to the window.
  const crop = async (buf, r, pad = 0) => {
    const x = Math.max(0, Math.floor((r.x - pad) * SCALE))
    const y = Math.max(0, Math.floor((r.y - pad) * SCALE))
    const width = Math.min(w * SCALE - x, Math.ceil((r.w + pad * 2) * SCALE))
    const height = Math.min(h * SCALE - y, Math.ceil((r.h + pad * 2) * SCALE))
    const size = await sharp(buf).metadata()
    if (x + width > size.width || y + height > size.height || width <= 0 || height <= 0)
      throw new Error(
        `bad crop ${JSON.stringify({ r, x, y, width, height, size: [size.width, size.height] })}`
      )
    return sharp(buf).extract({ left: x, top: y, width, height }).toBuffer()
  }
  // Lets the page's own background go, so a picture can sit on a light or a dark page.
  const transparent = () =>
    dbg.sendCommand('Emulation.setDefaultBackgroundColorOverride', {
      color: { r: 0, g: 0, b: 0, a: 0 }
    })
  return { win, run, waitFor, hasText, click, clickSel, rectOf, grab, crop, transparent, w, h }
}

async function save(name, buf, { palette = true } = {}) {
  const file = join(OUT, name)
  const png = sharp(buf).png(
    palette ? { compressionLevel: 9, palette: true, quality: 90 } : { compressionLevel: 9 }
  )
  writeFileSync(file, await png.toBuffer())
  console.log('wrote', name)
}

// The card (with Pip peeking above it) in the overlay, tight.
async function shotOverlay(page, name, pad = 14) {
  await sleep(1300) // the card's rise-in
  // Everything the overlay drew: the union of its elements, not the full-window wrapper.
  const r = await page.run(`(() => {
    const vw = innerWidth, vh = innerHeight
    const els = [...document.querySelectorAll('[data-overlay-root] > div:not(.fixed), [data-overlay-root] > div:not(.fixed) *')]
    const rs = els
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0 && r.width < vw - 2 && r.height < vh - 2)
    const x = Math.min(...rs.map((r) => r.left)), y = Math.min(...rs.map((r) => r.top))
    return { x, y, w: Math.max(...rs.map((r) => r.right)) - x, h: Math.max(...rs.map((r) => r.bottom)) - y }
  })()`)
  await save(name, await page.crop(await page.grab(), r, pad))
}

// Frames of a GIF: the same fixed region every time, so the picture doesn't jump.
async function gif(name, frames, { width, loop = 0 }) {
  const resized = await Promise.all(
    frames.map((f) =>
      sharp(f.buf)
        .resize({ width })
        .removeAlpha()
        // A thin border, so the picture reads as a window on a dark page too.
        .extend({ top: 2, bottom: 2, left: 2, right: 2, background: '#cfcac0' })
        .png()
        .toBuffer()
    )
  )
  const out = await sharp(resized, { join: { animated: true } })
    .gif({ delay: frames.map((f) => f.ms), loop, effort: 10, colours: 128, dither: 0.5 })
    .toBuffer()
  writeFileSync(join(OUT, name), out)
  console.log('wrote', name, `${(out.length / 1024).toFixed(0)} KB`, `${frames.length} frames`)
}

async function main() {
  mkdirSync(OUT, { recursive: true })

  // --- Banner: Pip and the name, transparent, in a light and a dark version.
  for (const dark of [false, true]) {
    const page = await open({ w: 700, h: 260, query: { spoons: '5' }, dark })
    await page.waitFor("document.querySelector('[data-overlay-root] svg.pip')")
    await page.run(`(() => {
      const pip = document.querySelector('[data-overlay-root] svg.pip').cloneNode(true)
      pip.setAttribute('class', 'pip')
      pip.setAttribute('width', '150')
      pip.setAttribute('height', '150')
      document.documentElement.style.background = 'transparent'
      document.body.style.background = 'transparent'
      document.body.innerHTML = ''
      const banner = document.createElement('div')
      banner.id = 'banner'
      banner.style.cssText = 'display:inline-flex;align-items:center;gap:32px;padding:20px 12px;color:var(--foreground)'
      const word = document.createElement('span')
      word.textContent = 'Pip'
      word.style.cssText = "font:700 124px/1 'Titillium Web',sans-serif;letter-spacing:-0.01em"
      banner.append(pip, word)
      document.body.append(banner)
    })()`)
    await page.transparent()
    await sleep(600)
    const r = await page.rectOf('#banner')
    await save(`banner-${dark ? 'dark' : 'light'}.png`, await page.crop(await page.grab(), r), {
      palette: false
    })
    page.win.destroy()
  }

  // --- The overlay: triage bubble, steps card, mood check, other cards.
  {
    const page = await open({ query: { spoons: '5' } })
    await page.waitFor(page.hasText('Break it into steps'))
    await shotOverlay(page, 'triage-bubble.png')

    await page.click('Break it into steps')
    await page.waitFor(page.hasText('Step 1 of 5'))
    await shotOverlay(page, 'steps-card.png')

    // Browse: read step 3 without finishing anything.
    await page.clickSel('[aria-label="Show step 3"]')
    await page.waitFor(page.hasText('Step 3 of 5'))
    await shotOverlay(page, 'steps-browse.png')
    await page.click('Back to step 1')
    await sleep(600)

    // Done twice, the third finishes the first half.
    await page.click('Done')
    await sleep(700)
    await page.click('Done')
    await sleep(700)
    await page.click('Done')
    await page.waitFor(page.hasText('How are you feeling?'))
    await shotOverlay(page, 'mood-check.png')
    await page.clickSel('[aria-label="Energy face 2 of 5"]')
    await page.waitFor(page.hasText('A short pause might help'))
    await shotOverlay(page, 'mood-options.png')
    page.win.destroy()
  }

  {
    const page = await open({ query: { spoons: '5' } })
    await page.waitFor(page.hasText("Help me ask what's unclear"))
    await page.click("Help me ask what's unclear")
    await page.waitFor(page.hasText('Copy question'))
    await shotOverlay(page, 'ask-dont-guess.png')
    page.win.destroy()
  }

  {
    const page = await open({ query: { spoons: '5' } })
    await page.waitFor(page.hasText('Plan for this change'))
    await page.click('Plan for this change')
    await page.waitFor(page.hasText('I have a plan'))
    await shotOverlay(page, 'change-plan.png')
    page.win.destroy()
  }

  {
    const page = await open({ query: { spoons: '5' }, dark: true })
    await page.waitFor(page.hasText('Break it into steps'))
    await page.click('Break it into steps')
    await page.waitFor(page.hasText('Step 1 of 5'))
    await shotOverlay(page, 'steps-card-dark.png')
    page.win.destroy()
  }

  // --- Command menu, Tell Pip, morning check-in.
  {
    const page = await open({ query: { menu: '1' } })
    await page.waitFor(page.hasText('Tell Pip'))
    await shotOverlay(page, 'command-menu.png')
    page.win.destroy()
  }
  {
    const page = await open({ query: { tell: '1' } })
    await page.waitFor(page.hasText('Send'))
    await shotOverlay(page, 'tell-pip.png')
    page.win.destroy()
  }
  {
    const page = await open({ w: 560, h: 420 })
    await page.waitFor(page.hasText('energy'))
    await sleep(900)
    await save('check-in.png', await page.grab())
    page.win.destroy()
  }

  // --- Onboarding (first run), then Pip's House once it is skipped.
  {
    const page = await open({ w: 1000, h: 680, hash: '/home' })
    await page.waitFor(page.hasText("Hi, I'm Pip."))
    await sleep(1200)
    await save('onboarding-welcome.png', await page.grab())
    await page.click("Let's start")
    await sleep(1500)
    await page.click('Skip setup')
    await sleep(1200)
    const tour = []
    // The GIF tours every tab; only the two the README discusses are also saved as pictures.
    const tabs = [
      [null, '/home'],
      ['house-profile.png', '/home/profile'],
      [null, '/home/achievements'],
      ['house-summary.png', '/home/summary'],
      [null, '/home/settings']
    ]
    for (const [name, route] of tabs) {
      await page.run(`location.hash = '#${route}'`)
      await sleep(2000)
      const buf = await page.grab()
      if (name) await save(name, buf)
      tour.push({ buf, ms: 2200 })
    }
    await gif('house-tour.gif', tour, { width: 760 })
    page.win.destroy()
  }
}

app.whenReady().then(() =>
  main().then(
    () => app.quit(),
    (err) => {
      console.error(err)
      app.exit(1)
    }
  )
)
// Offscreen windows never show, so closing them must not quit the app mid-run.
app.on('window-all-closed', () => {})

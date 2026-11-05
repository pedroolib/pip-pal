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
  return { win, run, waitFor, hasText, click, clickSel, rectOf, grab, crop, w, h }
}

async function save(name, buf) {
  const file = join(OUT, name)
  writeFileSync(
    file,
    await sharp(buf).png({ compressionLevel: 9, palette: true, quality: 90 }).toBuffer()
  )
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
    frames.map((f) => sharp(f.buf).resize({ width }).removeAlpha().png().toBuffer())
  )
  const out = await sharp(resized, { join: { animated: true } })
    .gif({ delay: frames.map((f) => f.ms), loop, effort: 10, colours: 128, dither: 0.5 })
    .toBuffer()
  writeFileSync(join(OUT, name), out)
  console.log('wrote', name, `${(out.length / 1024).toFixed(0)} KB`, `${frames.length} frames`)
}

async function main() {
  mkdirSync(OUT, { recursive: true })

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

  // --- The steps flow as a GIF: bubble, steps, browse, done, mood, options, all done.
  {
    const page = await open({ query: { spoons: '5' } })
    const region = { x: 0, y: 0, w: 500, h: 580 }
    const frames = []
    const snap = async (ms, settle = 1000) => {
      await sleep(settle)
      frames.push({ buf: await page.crop(await page.grab(), region), ms })
    }
    await page.waitFor(page.hasText('Break it into steps'))
    await snap(2200)
    await page.click('Break it into steps')
    await page.waitFor(page.hasText('Step 1 of 5'))
    await snap(2200)
    await page.clickSel('[aria-label="Show step 4"]')
    await page.waitFor(page.hasText('Step 4 of 5'))
    await snap(2000, 800)
    await page.click('Back to step 1')
    await sleep(500)
    await page.click('Done')
    await page.waitFor(page.hasText('Step 2 of 5'))
    await snap(1600, 800)
    await page.click('Done')
    await page.waitFor(page.hasText('Step 3 of 5'))
    await page.click('Done')
    await page.waitFor(page.hasText('How are you feeling?'))
    await snap(2200)
    await page.clickSel('[aria-label="Energy face 2 of 5"]')
    await page.waitFor(page.hasText('A short pause might help'))
    await snap(2600)
    await page.click('Continue')
    await page.waitFor(page.hasText('Step 4 of 5'))
    await snap(1600, 800)
    await page.click('Done')
    await page.waitFor(page.hasText('Step 5 of 5'))
    await page.click('Done')
    await page.waitFor(page.hasText('All done for now'))
    await snap(2600)
    await gif('steps-flow.gif', frames, { width: 640 })
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

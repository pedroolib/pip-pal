// The overlay lets clicks fall through to the app underneath, except over Pip's own surfaces: every
// shadcn `Card`, plus anything marked `data-overlay-hit` (the Pip character, pills). Main ignores
// this outside the overlay window and on Linux.
import { api } from '@renderer/api'

const HIT = '[data-slot="card"], [data-overlay-hit]'

let interactive = false

function setInteractive(next: boolean): void {
  if (next === interactive) return
  interactive = next
  api.setOverlayInteractive(next)
}

// Start in sync with main, also after a dev reload that left the window clickable.
api.setOverlayInteractive(false)

window.addEventListener('mousemove', (e) => {
  setInteractive(e.target instanceof Element && e.target.closest(HIT) !== null)
})
document.documentElement.addEventListener('mouseleave', () => setInteractive(false))

// Sizes the overlay's text to its window: the largest root font size at which the open card fits
// without scrolling. Everything in the overlay is in rem, so text, spacing, buttons and Pip scale
// together and there's no empty space left whatever shape the person drags the window into.
import { useLayoutEffect } from 'react'

// Below MIN the card scrolls instead: legibility first (Atkinson Hyperlegible, never tiny text).
const MIN = 14
const MAX = 28
const STEPS = 7 // binary search: (MAX - MIN) / 2^7 ≈ 0.1px

// Elements that scroll when the content doesn't fit: every card, plus inner scroll areas.
const SCROLLERS = '[data-slot="card"], [data-fit-scroll]'

function fits(root: HTMLElement): boolean {
  for (const el of root.querySelectorAll<HTMLElement>(SCROLLERS)) {
    if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) return false
  }
  return true
}

/**
 * `ref` is the element that fills the window and holds the card. Refits when the window is resized
 * and whenever `key` changes (a new card or step). Opening a section inside a card doesn't refit, so
 * the text doesn't shrink under the person's eyes; the card scrolls instead.
 */
export function useFitFont(
  ref: React.RefObject<HTMLElement | null>,
  active: boolean,
  key: unknown
): void {
  useLayoutEffect(() => {
    const html = document.documentElement
    const root = ref.current
    if (!active || !root) {
      html.style.fontSize = ''
      return
    }
    const fit = (): void => {
      let lo = MIN
      let hi = MAX
      for (let i = 0; i < STEPS; i++) {
        const mid = (lo + hi) / 2
        html.style.fontSize = `${mid}px`
        if (fits(root)) lo = mid
        else hi = mid
      }
      html.style.fontSize = `${lo}px`
    }
    fit()
    let frame = 0
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(fit)
    })
    observer.observe(root)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [ref, active, key])
}

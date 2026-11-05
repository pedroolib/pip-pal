// Light or dark. The choice is a per-computer nicety, so browser storage holds it: the overlay and
// Pip's House share it (same origin) and a change in one reaches the other through the `storage`
// event. "System" follows the computer's own light or dark setting, live.
import { useSyncExternalStore } from 'react'

export const THEMES = ['system', 'light', 'dark'] as const
export type ThemePref = (typeof THEMES)[number]

const KEY = 'pip.theme'
const CHANGED = 'pip-theme-change'
const darkQuery = (): MediaQueryList | null =>
  typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

/** Puts `.dark` on <html>. The House also switches color-scheme in main.css; the overlay never does,
 * because a dark color-scheme can paint an opaque canvas behind its transparent window. */
export function applyTheme(): void {
  const pref = getThemePref()
  const dark = pref === 'dark' || (pref === 'system' && !!darkQuery()?.matches)
  document.documentElement.classList.toggle('dark', dark)
}

/** Off when the computer asks for less motion or Settings has "Calmer motion" on. */
export function motionAllowed(): boolean {
  if (document.documentElement.classList.contains('calm-motion')) return false
  return !(
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export function setThemePref(pref: ThemePref): void {
  try {
    if (pref === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, pref)
  } catch {
    // Storage blocked: the choice lasts until the window closes.
  }
  // A soft cross-fade between themes where the browser can; otherwise an instant switch.
  if (motionAllowed() && typeof document.startViewTransition === 'function')
    document.startViewTransition(applyTheme)
  else applyTheme()
  window.dispatchEvent(new Event(CHANGED))
}

/** Once, at startup: apply now and follow the system and the other window from then on. */
export function initTheme(): void {
  applyTheme()
  darkQuery()?.addEventListener('change', applyTheme)
  window.addEventListener('storage', (e) => {
    if (e.key === KEY || e.key === null) {
      applyTheme()
      window.dispatchEvent(new Event(CHANGED))
    }
  })
}

function subscribe(cb: () => void): () => void {
  window.addEventListener(CHANGED, cb)
  return () => window.removeEventListener(CHANGED, cb)
}

/** The current choice, kept in step with the other window. */
export function useThemePref(): [ThemePref, (p: ThemePref) => void] {
  return [useSyncExternalStore(subscribe, getThemePref), setThemePref]
}

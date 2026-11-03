import type { Settings } from '@shared/schemas'
import i18n from '../i18n'

export const isMac = (platform: string): boolean => /mac/i.test(platform)

export const shortcutKeys = (mac: boolean): string[] =>
  mac ? ['⌃', '⇧', 'Space'] : ['Ctrl', 'Shift', 'Space']

/** A time for "Add a time": an hour after the latest one (9:00 if none), skipping used times. */
export function nextFreeTime(times: string[]): string {
  const minutes = (t: string): number => +t.slice(0, 2) * 60 + +t.slice(3, 5)
  const start = times.length ? Math.max(...times.map(minutes)) + 60 : 9 * 60
  // At most MAX_CHECK_INS times exist, so one of the next 24 hours is free.
  for (let i = 0; ; i++) {
    const d = (start + i * 60) % (24 * 60)
    const t = `${String(Math.floor(d / 60)).padStart(2, '0')}:${String(d % 60).padStart(2, '0')}`
    if (!times.includes(t)) return t
  }
}

/** Applies the settings the renderer owns: calmer motion and the language (only if translated). */
export function applySettings(s: Settings): void {
  document.documentElement.classList.toggle('calm-motion', s.calmMotion)
  if (i18n.hasResourceBundle(s.language, 'translation')) void i18n.changeLanguage(s.language)
}

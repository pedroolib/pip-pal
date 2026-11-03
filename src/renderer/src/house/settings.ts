import type { Settings } from '@shared/schemas'
import i18n from '../i18n'

export const isMac = (platform: string): boolean => /mac/i.test(platform)

export const shortcutKeys = (mac: boolean): string[] =>
  mac ? ['⌃', '⇧', 'Space'] : ['Ctrl', 'Shift', 'Space']

export type RowBucket = 'morning' | 'midday' | 'afternoon' | 'evening'

/** The label a check-in row shows for its time (display only; CheckIn.slot uses slotForHour). */
export const rowBucket = (time: string): RowBucket => {
  const h = +time.slice(0, 2)
  return h < 12 ? 'morning' : h < 15 ? 'midday' : h < 18 ? 'afternoon' : 'evening'
}

/** "HH:MM" as the time input shows it (12 h or 24 h by language). */
export const showTime = (time: string): string =>
  new Intl.DateTimeFormat(i18n.language, { hour: 'numeric', minute: '2-digit' }).format(
    new Date(2000, 0, 1, +time.slice(0, 2), +time.slice(3, 5))
  )

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

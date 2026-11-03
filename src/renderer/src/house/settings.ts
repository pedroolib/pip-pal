import type { Settings } from '@shared/schemas'
import { slotFor } from '../checkin/model'
import i18n from '../i18n'

export const isMac = (platform: string): boolean => /mac/i.test(platform)

export const shortcutKeys = (mac: boolean): string[] =>
  mac ? ['⌃', '⇧', 'Space'] : ['Ctrl', 'Shift', 'Space']

/** Is the check-in for the slot that `at` falls in turned on? */
export const slotOn = (s: Settings, at: Date): boolean => s.checkIns[slotFor(at)]

/** Applies the settings the renderer owns: calmer motion and the language (only if translated). */
export function applySettings(s: Settings): void {
  document.documentElement.classList.toggle('calm-motion', s.calmMotion)
  if (i18n.hasResourceBundle(s.language, 'translation')) void i18n.changeLanguage(s.language)
}

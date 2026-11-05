// Reading comfort: text size in Pip's House, and roomier line and letter spacing everywhere. Both
// follow the British Dyslexia Association's advice (larger text, line spacing around 1.5, a little
// extra space between letters and words). Applied as classes on <html>; see main.css.
import { localPref } from '@renderer/lib/localPref'

export const TEXT_SIZES = ['md', 'lg', 'xl'] as const
export type TextSize = (typeof TEXT_SIZES)[number]
export type Comfort = { size: TextSize; spacious: boolean }

const DEFAULT: Comfort = { size: 'md', spacious: false }

export const comfortPref = localPref<Comfort>('pip.reading', DEFAULT, (raw) => {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Partial<Comfort>
  return {
    size: TEXT_SIZES.includes(r.size as TextSize) ? (r.size as TextSize) : 'md',
    spacious: r.spacious === true
  }
})

export function applyComfort(): void {
  const { size, spacious } = comfortPref.get()
  const root = document.documentElement
  for (const s of TEXT_SIZES) root.classList.toggle(`text-size-${s}`, s === size && s !== 'md')
  root.classList.toggle('reading-spacious', spacious)
}

/** Once, at startup: apply now and follow the other window from then on. */
export function initComfort(): void {
  applyComfort()
  comfortPref.subscribe(applyComfort)
}

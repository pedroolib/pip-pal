// Pure list edits for the manual. New items get an id here, never in the UI.
import { ALIAS_MAX, aliasKey } from '@shared/profile'

type WithId = { id?: string }

/** Replaces the item with the same id, or appends it (with a fresh id) when it is new. */
export function upsert<T extends WithId>(list: T[], item: T): T[] {
  if (item.id && list.some((x) => x.id === item.id)) {
    return list.map((x) => (x.id === item.id ? item : x))
  }
  return [...list, { ...item, id: item.id ?? crypto.randomUUID() }]
}

export const removeById = <T extends WithId>(list: T[], id: string): T[] =>
  list.filter((x) => x.id !== id)

export const removeAt = <T>(list: T[], index: number): T[] => list.filter((_, i) => i !== index)

/**
 * Index of the section the reader is in: the last whose top is above a line at 30% of the viewport.
 * Near the end of the page the line slides down to the viewport bottom, so short last sections
 * can still become active in order. `remaining` is the scroll distance left to the page bottom.
 */
export function activeIndex(tops: number[], viewportH: number, remaining: number): number {
  const slide = viewportH * 0.7
  const line = viewportH * 0.3 + slide * Math.max(0, 1 - remaining / slide)
  let active = 0
  tops.forEach((top, i) => {
    if (top <= line) active = i
  })
  return active
}

/**
 * Adds nicknames typed or pasted as "a, b": trimmed; empty parts, case-insensitive duplicates and
 * aliases the scrubber would ignore (`aliasKey`: under 2 letters or digits, over ALIAS_MAX once folded) are skipped.
 */
export function addAlias(list: string[], text: string): string[] {
  const out = [...list]
  for (const raw of text.split(',')) {
    const a = raw.trim()
    if (aliasKey(a) !== null && !out.some((x) => x.toLowerCase() === a.toLowerCase())) out.push(a)
  }
  return out
}

/** True when a part of the text was skipped only for being too long: its first ALIAS_MAX characters would pass `aliasKey`. */
export function hasTooLongAlias(text: string): boolean {
  // shortcut: text that only exceeds the cap once folded (e.g. ligatures) gets no message, upgrade if that matters
  return text.split(',').some((raw) => {
    const a = raw.trim()
    return aliasKey(a) === null && aliasKey(a.slice(0, ALIAS_MAX)) !== null
  })
}

/** Adds the parts of "a, b" as chips; parts skipped only for length come back in `left`, to be shortened, not lost. */
export function splitAliases(list: string[], text: string): { aliases: string[]; left: string } {
  const left = text
    .split(',')
    .filter(hasTooLongAlias)
    .map((a) => a.trim())
    .join(', ')
  return { aliases: addAlias(list, text), left }
}

/** The aliases to save with the text left in the box, or null while that text holds a part over the cap. */
export function aliasesToSave(list: string[], pending: string): string[] | null {
  return hasTooLongAlias(pending) ? null : addAlias(list, pending)
}

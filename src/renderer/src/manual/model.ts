// Pure list edits for the manual. New items get an id here, never in the UI.
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

/** Must match the scrubber's alias cap in src/shared/profile.ts: longer aliases are not hidden. */
export const ALIAS_MAX = 40

/** Adds nicknames typed or pasted as "a, b": trimmed, empty, over-long and case-insensitive duplicates skipped. */
export function addAlias(list: string[], text: string): string[] {
  const out = [...list]
  for (const raw of text.split(',')) {
    const a = raw.trim()
    if (a && a.length <= ALIAS_MAX && !out.some((x) => x.toLowerCase() === a.toLowerCase())) out.push(a)
  }
  return out
}

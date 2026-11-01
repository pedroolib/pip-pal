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

/** Index of the section the reader is in: the last whose top is above 30% of the viewport. */
export function activeIndex(tops: number[], viewportH: number, atBottom: boolean): number {
  if (atBottom) return tops.length - 1
  let active = 0
  tops.forEach((top, i) => {
    if (top <= viewportH * 0.3) active = i
  })
  return active
}

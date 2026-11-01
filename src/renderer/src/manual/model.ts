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

// Date helpers for the House views. Local time, because "today" means the person's day.

const day = (d: Date): string => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

export const isToday = (iso: string, now = new Date()): boolean => day(new Date(iso)) === day(now)

/** Newest first. */
export const newestFirst = <T extends { at: string }>(items: T[]): T[] =>
  [...items].sort((x, y) => Date.parse(y.at) - Date.parse(x.at))

export const latest = <T extends { at: string }>(items: T[]): T | undefined => newestFirst(items)[0]

/** Groups newest-first items by calendar day; days come newest first too. */
export function groupByDay<T extends { at: string }>(items: T[]): { at: string; items: T[] }[] {
  const groups: { key: string; at: string; items: T[] }[] = []
  for (const item of newestFirst(items)) {
    const key = day(new Date(item.at))
    const g = groups.find((x) => x.key === key)
    if (g) g.items.push(item)
    else groups.push({ key, at: item.at, items: [item] })
  }
  return groups.map(({ at, items }) => ({ at, items }))
}

export const dayLabel = (iso: string, lang: string): string =>
  new Intl.DateTimeFormat(lang, { weekday: 'long', day: 'numeric', month: 'long' }).format(
    new Date(iso)
  )

export const timeLabel = (iso: string, lang: string): string =>
  new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

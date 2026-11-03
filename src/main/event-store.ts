// The usage log (events.json): main stamps id and at, and drops events past EVENT_RETENTION_DAYS (docs/DECISIONS.md §6).
import { EVENT_RETENTION_DAYS, LoggableEvent, UsageEvent } from '@shared/schemas'
import { createLogStore } from './log-store'
import { writeJsonAtomic } from './json-file'

type Unstamped<T> = T extends unknown ? Omit<T, 'id' | 'at'> : never
export type NewEvent = Unstamped<UsageEvent>

export function createEventStore(
  file: string,
  seed: unknown[] = [],
  now: () => Date = () => new Date()
): {
  list(): UsageEvent[]
  /** Main only: any kind, decoded and action included. */
  add(e: NewEvent): void
  /** From the untrusted renderer: asked, step and calm only. */
  addFromRenderer(e: unknown): void
  remove(id: string): void
  clear(): void
} {
  // Reading, seeding and corrupt-file backup are the log store's.
  const log = createLogStore(file, UsageEvent, seed)
  const fresh = (): UsageEvent[] => {
    const all = log.list()
    const since = now().getTime() - EVENT_RETENTION_DAYS * 86_400_000
    const kept = all.filter((e) => new Date(e.at).getTime() >= since)
    if (kept.length < all.length) writeJsonAtomic(file, kept)
    return kept
  }
  const add = (e: NewEvent): void => {
    const valid = UsageEvent.parse({ ...e, id: crypto.randomUUID(), at: now().toISOString() })
    writeJsonAtomic(file, [...fresh(), valid])
  }

  return {
    list: fresh,
    add,
    addFromRenderer(e) {
      const parsed = LoggableEvent.safeParse(e)
      // Never echo the input: it is the person's text.
      if (!parsed.success) throw new Error('Pip cannot log this event.')
      add(parsed.data)
    },
    remove(id) {
      if (typeof id !== 'string') throw new Error('The event id must be a string.')
      writeJsonAtomic(
        file,
        fresh().filter((e) => e.id !== id)
      )
    },
    clear: () => writeJsonAtomic(file, [])
  }
}

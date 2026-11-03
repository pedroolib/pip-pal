import { slotForHour, type CheckIn, type Slot } from '@shared/schemas'

/** The slot a check-in taken at `date` belongs to (same buckets main uses for its times). */
export const slotFor = (date: Date): Slot => slotForHour(date.getHours())

/** After "Not now", ask once more after this long, then leave it. */
export const SNOOZE_MS = 30 * 60 * 1000

/** Spoons from the latest check-in taken today (local time), or null if none: what `expand` and the plan trim use. */
export function spoonsToday(checkIns: CheckIn[], now: Date): number | null {
  const today = now.toDateString()
  const latest = checkIns
    .filter((c) => new Date(c.at).toDateString() === today)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0]
  return latest ? latest.spoons : null
}

// The reminders waiting to be shown, oldest first. Main fires each one once for its time, so the overlay
// holds them until it is hidden.
import type { Reminder } from '@shared/schemas'

export const oldestFirst = (a: Reminder, b: Reminder): number => Date.parse(a.at) - Date.parse(b.at)

export function addDue(queue: Reminder[], reminder: Reminder): Reminder[] {
  return [...queue.filter((r) => r.id !== reminder.id), reminder].sort(oldestFirst)
}

/** What is left against the stored list: a deleted one goes, an edited one updates, a moved one fires again by itself. */
export function refreshDue(queue: Reminder[], listed: Reminder[], now: Date): Reminder[] {
  return listed
    .filter((r) => queue.some((q) => q.id === r.id) && Date.parse(r.at) <= now.getTime())
    .sort(oldestFirst)
}

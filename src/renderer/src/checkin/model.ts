import { slotForHour, type Slot } from '@shared/schemas'

/** The slot a check-in taken at `date` belongs to (same buckets main uses for its times). */
export const slotFor = (date: Date): Slot => slotForHour(date.getHours())

/** After "Not now", ask once more after this long, then leave it. */
export const SNOOZE_MS = 30 * 60 * 1000

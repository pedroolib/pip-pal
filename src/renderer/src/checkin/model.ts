import type { Slot } from '@shared/schemas'

/** Check-ins are due at 9, 13 and 17 h; one taken in between counts for the slot it follows. */
export function slotFor(date: Date): Slot {
  const h = date.getHours()
  return h < 13 ? 'morning' : h < 17 ? 'midday' : 'afternoon'
}

/** After "Not now", ask once more after this long, then leave it. */
export const SNOOZE_MS = 30 * 60 * 1000

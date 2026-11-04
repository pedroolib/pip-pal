// Reminder times. Quick times are computed when the person saves, not when the form opened.
export type QuickTime = 'in15' | 'in1h' | 'tomorrow9'

const MIN = 60_000

export function quickAt(kind: QuickTime, now: Date): Date {
  if (kind === 'in15') return new Date(now.getTime() + 15 * MIN)
  if (kind === 'in1h') return new Date(now.getTime() + 60 * MIN)
  // Built from calendar fields, so a DST change between now and then cannot move it off 09:00.
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0)
}

/** The native date ("2026-11-05") and time ("14:30") inputs, read as local time. Null until both are filled. */
export function customAt(date: string, time: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const t = /^(\d{2}):(\d{2})/.exec(time)
  if (!d || !t) return null
  return new Date(+d[1], +d[2] - 1, +d[3], +t[1], +t[2])
}

const dayStart = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** "tomorrow, Wed, Nov 4, 9:00 AM": the exact moment, with today or tomorrow in words. */
export function describeWhen(at: Date, now: Date, locale: string): string {
  const exact = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(at)
  // Calendar days apart; a 23 or 25 hour day on a DST change still rounds to the right count.
  const days = Math.round((dayStart(at) - dayStart(now)) / 86_400_000)
  if (days !== 0 && days !== 1) return exact
  return `${new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(days, 'day')}, ${exact}`
}

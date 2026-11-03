// When Pip asks for spoons. Each time is asked at most once a day and only if it wasn't answered:
// Pip never insists (the overlay's "Not now" handles the one reminder).
import { dueCheckIn, onDay, slotForHour, type CheckIn, type Slot } from '@shared/schemas'

/** The first of `times` (sorted "HH:MM") strictly after `now`; after the last one, tomorrow's first. */
export function nextCheckIn(now: Date, times: string[]): Date | null {
  if (!times.length) return null
  const next = times.find((t) => onDay(now, t) > now)
  if (next) return onDay(now, next)
  return onDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1), times[0])
}

/**
 * Calls `onDue` at each check-in time. Timers stall while the Mac sleeps, so call `resume` on wake:
 * it asks for the latest time that passed during sleep (once) and re-arms the timer. `times` is read
 * when the timer is armed and when it fires; call `reschedule` after the times change.
 */
export function startCheckInSchedule(opts: {
  listCheckIns(): CheckIn[]
  onDue(slot: Slot): void
  /** The enabled times, sorted "HH:MM". */
  times(): string[]
  now?: () => Date
}): { resume(): void; reschedule(): void; stop(): void } {
  const { now = () => new Date() } = opts
  const asked = new Set<string>()
  let timer: ReturnType<typeof setTimeout> | undefined
  const latestPassed = (t: Date): string | undefined =>
    opts
      .times()
      .filter((x) => onDay(t, x) <= t)
      .at(-1)

  const check = (): void => {
    const t = now()
    const time = latestPassed(t)
    const key = `${t.toDateString()} ${time}`
    if (!time || asked.has(key)) return
    asked.add(key)
    if (dueCheckIn(opts.times(), opts.listCheckIns(), t)) opts.onDue(slotForHour(+time.slice(0, 2)))
  }
  // The latest passed time counts as asked, as at launch: a time moved into the past isn't asked on wake.
  const markAsked = (): void => void asked.add(`${now().toDateString()} ${latestPassed(now())}`)
  // shortcut: on the spring-forward day a time can fire up to an hour late; fine once a year.
  const arm = (): void => {
    clearTimeout(timer)
    const t = now()
    const next = nextCheckIn(t, opts.times())
    if (!next) return // all off: a settings save calls reschedule
    timer = setTimeout(() => {
      check()
      arm()
    }, next.getTime() - t.getTime())
  }

  // The overlay already asks at launch when the latest time is unanswered.
  markAsked()
  arm()
  return {
    resume(): void {
      check()
      arm()
    },
    reschedule(): void {
      markAsked()
      arm()
    },
    stop: () => clearTimeout(timer)
  }
}

/** Dev only: `PIP_CHECK_IN_TIMES=10:05,10:06,10:07` (one to six) rehearses check-ins without waiting. */
export function parseCheckInTimes(value: string | undefined): string[] | undefined {
  const parts = value?.split(',').map((s) => /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(s.trim()))
  if (!parts || parts.length > 6 || parts.some((m) => !m)) return undefined
  return parts.map((m) => `${m![1].padStart(2, '0')}:${m![2]}`).sort()
}

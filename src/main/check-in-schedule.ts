// When Pip asks for spoons. Each time is asked at most once a day and only if it wasn't answered:
// Pip never insists (the overlay's "Not now" handles the one reminder).
import { dueCheckIn, slotForHour, type CheckIn, type Slot } from '@shared/schemas'

const on = (day: Date, time: string): Date =>
  new Date(day.getFullYear(), day.getMonth(), day.getDate(), +time.slice(0, 2), +time.slice(3, 5))

/** The first of `times` (sorted "HH:MM") strictly after `now`; after the last one, tomorrow's first. */
export function nextCheckIn(now: Date, times: string[]): Date | null {
  if (!times.length) return null
  const next = times.find((t) => on(now, t) > now)
  if (next) return on(now, next)
  return on(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1), times[0])
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
      .filter((x) => on(t, x) <= t)
      .at(-1)

  const check = (): void => {
    const t = now()
    const time = latestPassed(t)
    const key = `${t.toDateString()} ${time}`
    if (!time || asked.has(key)) return
    asked.add(key)
    if (dueCheckIn(opts.times(), opts.listCheckIns(), t)) opts.onDue(slotForHour(+time.slice(0, 2)))
  }
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
  asked.add(`${now().toDateString()} ${latestPassed(now())}`)
  arm()
  return {
    resume(): void {
      check()
      arm()
    },
    reschedule: arm,
    stop: () => clearTimeout(timer)
  }
}

/** Dev only: `PIP_CHECK_IN_TIMES=10:05,10:06,10:07` (one to six) rehearses check-ins without waiting. */
export function parseCheckInTimes(value: string | undefined): string[] | undefined {
  const parts = value?.split(',').map((s) => /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(s.trim()))
  if (!parts || parts.length > 6 || parts.some((m) => !m)) return undefined
  return parts.map((m) => `${m![1].padStart(2, '0')}:${m![2]}`).sort()
}

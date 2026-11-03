// When Pip asks for spoons. Each slot is asked at most once a day and only if it wasn't answered:
// Pip never insists (the overlay's "Not now" handles the one reminder).
import type { CheckIn, Slot } from '@shared/schemas'

export interface CheckInTime {
  slot: Slot
  hour: number
  minute: number
}

/** 9, 13 and 17 h, the same hours as `slotFor` in the renderer's checkin/model.ts. */
export const CHECK_IN_TIMES: CheckInTime[] = [
  { slot: 'morning', hour: 9, minute: 0 },
  { slot: 'midday', hour: 13, minute: 0 },
  { slot: 'afternoon', hour: 17, minute: 0 }
]

const on = (day: Date, t: CheckInTime): Date =>
  new Date(day.getFullYear(), day.getMonth(), day.getDate(), t.hour, t.minute)

/** The first check-in time strictly after `now`; after the last one, tomorrow's first. */
export function nextCheckIn(now: Date, times = CHECK_IN_TIMES): { slot: Slot; at: Date } {
  for (const t of times) if (on(now, t) > now) return { slot: t.slot, at: on(now, t) }
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  return { slot: times[0].slot, at: on(tomorrow, times[0]) }
}

/** The slot whose time passed most recently today, or null before the first one. */
export function currentSlot(now: Date, times = CHECK_IN_TIMES): Slot | null {
  return times.filter((t) => on(now, t) <= now).at(-1)?.slot ?? null
}

export function answered(checkIns: CheckIn[], slot: Slot, now: Date): boolean {
  const today = now.toDateString()
  return checkIns.some((c) => c.slot === slot && new Date(c.at).toDateString() === today)
}

/**
 * Calls `onDue` at each check-in time. Timers stall while the Mac sleeps, so call `resume` on wake:
 * it asks for the slot that passed during sleep (once) and re-arms the timer.
 */
export function startCheckInSchedule(opts: {
  listCheckIns(): CheckIn[]
  onDue(slot: Slot): void
  /** Read at fire time, so a settings toggle needs no restart. */
  enabled?(slot: Slot): boolean
  times?: CheckInTime[]
  now?: () => Date
}): { resume(): void; stop(): void } {
  const { times = CHECK_IN_TIMES, now = () => new Date() } = opts
  const asked = new Set<string>()
  let timer: ReturnType<typeof setTimeout> | undefined

  const check = (): void => {
    const t = now()
    const slot = currentSlot(t, times)
    const key = `${t.toDateString()} ${slot}`
    if (!slot || asked.has(key)) return
    asked.add(key) // a slot skipped as disabled stays skipped if re-enabled later
    if (opts.enabled && !opts.enabled(slot)) return
    if (!answered(opts.listCheckIns(), slot, t)) opts.onDue(slot)
  }
  const arm = (): void => {
    clearTimeout(timer)
    const t = now()
    timer = setTimeout(
      () => {
        check()
        arm()
      },
      nextCheckIn(t, times).at.getTime() - t.getTime()
    )
  }

  // The overlay already asks at launch when there's no check-in today.
  asked.add(`${now().toDateString()} ${currentSlot(now(), times)}`)
  arm()
  return {
    resume(): void {
      check()
      arm()
    },
    stop: () => clearTimeout(timer)
  }
}

/** Dev only: `PIP_CHECK_IN_TIMES=10:05,10:06,10:07` rehearses the three check-ins without waiting. */
export function parseCheckInTimes(value: string | undefined): CheckInTime[] | undefined {
  const parts = value?.split(',').map((s) => /^(\d{1,2}):(\d{2})$/.exec(s.trim()))
  if (!parts || parts.length !== CHECK_IN_TIMES.length || parts.some((m) => !m)) return undefined
  return CHECK_IN_TIMES.map((t, i) => ({
    slot: t.slot,
    hour: Number(parts[i]![1]),
    minute: Number(parts[i]![2])
  }))
}

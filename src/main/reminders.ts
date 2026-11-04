// "Remind me later": saved reminders, fired from here so they survive a restart and need no open card.
// A reminder that gets no answer is shown again 5, 10 and 15 minutes later, then parked on Home.
import { randomUUID } from 'crypto'
import {
  REMINDER_NUDGES,
  Reminder,
  type NewReminder,
  type ReminderDelay
} from '@shared/schemas'

const MIN = 60_000
const NUDGE_MS = [5 * MIN, 10 * MIN, 15 * MIN]
/** Two reminders due together: the second waits this long so it doesn't replace the first on screen. */
const GAP_MS = 30_000
/** Older than this when it fires = it came due while Pip was closed or asleep. */
const MISSED_MS = MIN
const TOMORROW_AT = 9
// setTimeout overflows past this.
const MAX_TIMER = 2 ** 31 - 1

// shortcut: "tomorrow" is the next calendar day at 09:00 even at 00:30; upgrade if people mean "this morning".
export function dueFor(delay: ReminderDelay, now: Date): Date {
  switch (delay) {
    case '5m':
      return new Date(now.getTime() + 5 * MIN)
    case '15m':
      return new Date(now.getTime() + 15 * MIN)
    case '30m':
      return new Date(now.getTime() + 30 * MIN)
    case '1h':
      return new Date(now.getTime() + 60 * MIN)
    case 'tomorrow':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, TOMORROW_AT)
  }
}

export interface ReminderStore {
  list(): Reminder[]
  replace(items: Reminder[]): void
}

export type Reminders = ReturnType<typeof startReminders>

export function startReminders(opts: {
  store: ReminderStore
  onDue(reminder: Reminder, missed: boolean): void
  now?: () => Date
}): {
  add(r: NewReminder, delay: ReminderDelay): Reminder
  reschedule(id: string, delay: ReminderDelay): void
  finish(id: string): void
  /** Drops every reminder of a kind (the check-in was answered). */
  finishKind(kind: Reminder['kind']): void
  show(id: string): void
  list(): Reminder[]
  /** Fires whatever is due now (launch, wake from sleep) and re-arms. */
  resume(): void
  stop(): void
} {
  const { store, now = () => new Date() } = opts
  let timer: ReturnType<typeof setTimeout> | undefined

  const arm = (gap = 0): void => {
    clearTimeout(timer)
    const due = store
      .list()
      .filter((r) => !r.parked)
      .map((r) => Date.parse(r.dueAt))
    if (!due.length) return
    const wait = Math.min(Math.max(Math.min(...due) - now().getTime(), gap), MAX_TIMER)
    timer = setTimeout(fire, wait)
  }

  const fire = (): void => {
    const t = now().getTime()
    const all = store.list()
    const next = all
      .filter((r) => !r.parked && Date.parse(r.dueAt) <= t)
      .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))[0]
    if (!next) return arm() // the timer woke early (clock change): wait again
    const shown: Reminder =
      next.nudges < REMINDER_NUDGES
        ? {
            ...next,
            nudges: next.nudges + 1,
            dueAt: new Date(t + NUDGE_MS[next.nudges]).toISOString()
          }
        : { ...next, parked: true }
    store.replace(all.map((r) => (r.id === next.id ? shown : r)))
    opts.onDue(shown, t - Date.parse(next.dueAt) > MISSED_MS)
    arm(GAP_MS)
  }

  const update = (id: string, change: (r: Reminder) => Reminder): void => {
    store.replace(store.list().map((r) => (r.id === id ? change(r) : r)))
    arm()
  }

  return {
    add(r, delay) {
      const added = Reminder.parse({
        ...r,
        id: randomUUID(),
        dueAt: dueFor(delay, now()).toISOString(),
        nudges: 0,
        parked: false
      })
      // The same message's steps (or the check-in) never pile up: the newest time wins.
      const same = (o: Reminder): boolean => o.kind === added.kind && o.source === added.source
      store.replace([...store.list().filter((o) => !same(o)), added])
      arm()
      return added
    },
    reschedule: (id, delay) =>
      update(id, (r) => ({
        ...r,
        dueAt: dueFor(delay, now()).toISOString(),
        nudges: 0,
        parked: false
      })),
    finish(id) {
      store.replace(store.list().filter((r) => r.id !== id))
      arm()
    },
    finishKind(kind) {
      store.replace(store.list().filter((r) => r.kind !== kind))
      arm()
    },
    show: (id) =>
      update(id, (r) => ({ ...r, dueAt: now().toISOString(), nudges: 0, parked: false })),
    list: () => store.list(),
    resume() {
      fire()
    },
    stop: () => clearTimeout(timer)
  }
}

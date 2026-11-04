// When a reminder comes due, and the rules for saving one. Reminders stay on this machine, apart from
// the profile and the events, so no summary or Claude call can include them.
import { z } from 'zod'
import { REMINDER_ERROR, REMINDER_MAX, Reminder, hasVisibleText } from '@shared/schemas'

// setTimeout fires at once above this, so a longer wait re-arms when it runs out.
const MAX_DELAY_MS = 2 ** 31 - 1
const RETRY_MS = 60_000
// The form picks a time a moment before it saves; clocks and slow saves must not trip it.
const PAST_GRACE_MS = 5000

/**
 * Calls `onDue` for each reminder whose time has passed, oldest first, once per run unless its `at`
 * changes. `list` is read on every check, so a deleted or edited reminder can't fire at its old time.
 * Return [] from `list` to hold reminders back; call `refresh` when that ends.
 */
export function startReminderSchedule(opts: {
  list(): Reminder[]
  onDue(reminder: Reminder): void
  now?: () => Date
}): {
  /** Fires what is due and re-arms: after a save or delete, and on wake (timers stall in sleep). */
  refresh(): void
  /** The overlay's page was replaced and lost what it was showing: send what is overdue again. */
  redeliver(): void
  stop(): void
} {
  const { now = () => new Date() } = opts
  const fired = new Map<string, number>() // id → the `at` it fired for
  let timer: ReturnType<typeof setTimeout> | undefined

  const refresh = (): void => {
    clearTimeout(timer)
    let delay = RETRY_MS // runs in a timer: a locked file must not become an uncaught exception
    try {
      const t = now().getTime()
      const items = opts.list().map((reminder) => ({ reminder, at: Date.parse(reminder.at) }))
      const due = items
        .filter(({ reminder, at }) => at <= t && fired.get(reminder.id) !== at)
        .sort((a, b) => a.at - b.at)
      for (const { reminder, at } of due) {
        opts.onDue(reminder)
        fired.set(reminder.id, at)
      }
      const next = Math.min(...items.map(({ at }) => at).filter((at) => at > t))
      delay = Math.min(next - t, MAX_DELAY_MS) // none ahead: Infinity, so an idle re-check
    } catch (err) {
      console.warn('[reminders] Could not check reminders.', err)
    }
    timer = setTimeout(refresh, delay)
  }

  refresh()
  return {
    refresh,
    redeliver(): void {
      fired.clear()
      refresh()
    },
    stop: () => clearTimeout(timer)
  }
}

type Store = { list(): Reminder[]; replace(items: Reminder[]): void }

/** Creates, or updates the one with the same id. `input` comes from the renderer; throws if it is bad. */
export function saveReminder(store: Store, input: unknown, now = new Date()): void {
  const parsed = Reminder.safeParse(input)
  if (!parsed.success) {
    const long = parsed.error.issues.some((i) => i.path[0] === 'text' && i.code === 'too_big')
    throw new Error(
      long ? `${REMINDER_ERROR.long} A reminder is too long.` : 'A reminder is not valid.'
    )
  }
  const reminder = parsed.data
  if (!hasVisibleText(reminder.text)) throw new Error('A reminder needs some text.')
  const all = store.list()
  const old = all.find((r) => r.id === reminder.id)
  if (!old && all.length >= REMINDER_MAX)
    throw new Error(`${REMINDER_ERROR.full} Too many reminders.`)
  const moved = !old || old.at !== reminder.at
  if (moved && Date.parse(reminder.at) < now.getTime() - PAST_GRACE_MS) {
    throw new Error(`${REMINDER_ERROR.past} A reminder must be in the future.`)
  }
  store.replace(old ? all.map((r) => (r === old ? reminder : r)) : [...all, reminder])
}

export function deleteReminder(store: Store, id: unknown): void {
  const valid = z.string().min(1).parse(id)
  store.replace(store.list().filter((r) => r.id !== valid))
}

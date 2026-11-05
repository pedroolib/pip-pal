// Pause: Pip stays quiet. While paused no check-in or reminder pops up on its own (reminders wait
// and come up after); the shortcut still works, because pressing it is the person asking. A pause
// can end at a time or last until the person resumes.
import { useEffect, useState } from 'react'
import { localPref } from '@renderer/lib/localPref'

/** `until` is an ISO time, or null for "until I resume". Null pause means not paused. */
export type Pause = { until: string | null } | null

export const pausePref = localPref<Pause>('pip.pause', null, (raw) => {
  if (!raw || typeof raw !== 'object') return null
  const until = (raw as { until?: unknown }).until
  return until === null || typeof until === 'string' ? { until } : null
})

export const isPaused = (p: Pause, now = new Date()): boolean =>
  !!p && (p.until === null || Date.parse(p.until) > now.getTime())

export type PauseLength = 'hour' | 'tomorrow' | 'resume'

/** When a pause of this length ends: in an hour, at 8:00 tomorrow, or never on its own. */
export function pauseUntil(length: PauseLength, now = new Date()): string | null {
  if (length === 'resume') return null
  if (length === 'hour') return new Date(now.getTime() + 60 * 60 * 1000).toISOString()
  const t = new Date(now)
  t.setDate(t.getDate() + 1)
  t.setHours(8, 0, 0, 0)
  return t.toISOString()
}

export const pause = (length: PauseLength): void => pausePref.set({ until: pauseUntil(length) })
export const resume = (): void => pausePref.set(null)

/** Whether Pip is paused right now; turns false by itself when a timed pause runs out. */
export function usePaused(): [boolean, Pause] {
  const [p] = pausePref.use()
  const [, tick] = useState(0)
  useEffect(() => {
    if (!p?.until) return
    const left = Date.parse(p.until) - Date.now()
    if (left <= 0) return
    // Timers are capped near 24.8 days; a pause that long just rechecks then.
    const timer = setTimeout(() => tick((n) => n + 1), Math.min(left + 50, 2 ** 31 - 1))
    return () => clearTimeout(timer)
  }, [p])
  return [isPaused(p), p]
}

import { LOW_SPOONS } from '@shared/schemas'
import { LOW_SPOONS_STEPS } from '../decode/model'

/** Pip asks how the person feels at most this many times per task. */
export const MOOD_ASKS = 3

/** Steps between questions: a third of the plan, rounded up (6 steps: every 2). */
export const moodEvery = (total: number): number => Math.max(1, Math.ceil(total / MOOD_ASKS))

/**
 * After finishing a step: is it time to ask? `done` is how many steps are finished, `since` how many
 * since the last question. Finishing the last step always asks (if the cap allows); a plan of 1 or 2
 * steps asks only then.
 */
export function moodDue(o: {
  total: number
  done: number
  since: number
  asks: number
  every: number
}): boolean {
  if (o.asks >= MOOD_ASKS) return false
  return o.done >= o.total || (o.total >= MOOD_ASKS && o.since >= o.every)
}

export type MoodLevel = 'low' | 'mid' | 'high'
export const moodLevel = (spoons: number): MoodLevel =>
  spoons <= LOW_SPOONS ? 'low' : spoons >= 4 ? 'high' : 'mid'

/** A low answer keeps only the next few steps visible; an earlier, tighter cut stays. */
export const cutAfterLow = (step: number, cut: number | null): number =>
  Math.min(cut ?? Infinity, step + LOW_SPOONS_STEPS)

/** The cut after "I'm stuck" swaps the current step for `added` smaller ones. */
export const cutAfterUnstick = (
  cut: number | null,
  step: number,
  added: number
): number | null => (cut === null ? null : added + Math.max(0, cut - (step + 1)))

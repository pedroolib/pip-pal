import { LOW_SPOONS } from '@shared/schemas'
import { LOW_SPOONS_STEPS } from '../decode/model'

/**
 * Pip asks how the person feels once per list of steps, halfway through (5 steps: after the 3rd).
 * A single step has no halfway, so it never asks. `done` is how many steps are finished.
 */
export function moodDue(o: { total: number; done: number; asked: boolean }): boolean {
  return !o.asked && o.total >= 2 && o.done === Math.ceil(o.total / 2)
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

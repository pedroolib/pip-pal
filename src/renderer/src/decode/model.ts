import { LOW_SPOONS, type Classification } from '@shared/schemas'

/** Steps shown when spoons are low; the rest are marked "can wait". */
export const LOW_SPOONS_STEPS = 3

/** Above this, Pip doesn't guess and offers the drafted question instead. Calibrate on the test set. */
export const AMBIGUOUS_AT = 0.6

/** Splits the plan by energy. The cut is code, not the model (docs/DECISIONS.md §4). */
export function planSteps<T>(steps: T[], spoons: number | null): { now: T[]; later: T[] } {
  if (spoons === null || spoons > LOW_SPOONS) return { now: steps, later: [] }
  return { now: steps.slice(0, LOW_SPOONS_STEPS), later: steps.slice(LOW_SPOONS_STEPS) }
}

export function showAsk(classification: Classification, uncertainties: unknown[]): boolean {
  return classification.isAmbiguous >= AMBIGUOUS_AT && uncertainties.length > 0
}

export type Segment = 'done' | 'current' | 'todo'

/** One segment per step for the task card's progress bar. */
export function segments(total: number, current: number): Segment[] {
  return Array.from({ length: total }, (_, i) =>
    i < current ? 'done' : i === current ? 'current' : 'todo'
  )
}

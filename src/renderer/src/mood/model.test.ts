import { describe, expect, it } from 'vitest'
import { planSteps } from '../decode/model'
import { cutAfterLow, cutAfterUnstick, moodDue, moodEvery, moodLevel } from './model'

// Walks a plan of `total` steps the way the overlay does and returns the steps after which Pip asks.
function asksFor(total: number): number[] {
  const every = moodEvery(total)
  let since = 0
  let asks = 0
  const at: number[] = []
  for (let done = 1; done <= total; done++) {
    since++
    if (moodDue({ total, done, since, asks, every })) {
      at.push(done)
      asks++
      since = 0
    }
  }
  return at
}

describe('moodDue', () => {
  it('asks every third of the plan, the last time on the final step', () => {
    expect(asksFor(6)).toEqual([2, 4, 6])
    expect(asksFor(5)).toEqual([2, 4, 5])
    expect(asksFor(7)).toEqual([3, 6, 7])
    expect(asksFor(3)).toEqual([1, 2, 3])
  })

  it('asks once, on the last step, for plans of one or two steps', () => {
    expect(asksFor(1)).toEqual([1])
    expect(asksFor(2)).toEqual([2])
  })

  it('never asks more than three times', () => {
    for (let n = 1; n <= 30; n++) expect(asksFor(n).length).toBeLessThanOrEqual(3)
  })
})

describe('moodLevel', () => {
  it('groups the five faces', () => {
    expect([1, 2, 3, 4, 5].map(moodLevel)).toEqual(['low', 'low', 'mid', 'high', 'high'])
  })
})

describe('cuts', () => {
  it('keeps the next three steps after a low answer, never loosening an earlier cut', () => {
    expect(cutAfterLow(2, null)).toBe(5)
    expect(cutAfterLow(4, 5)).toBe(5)
  })

  it('shows more steps once the full list is back, and less after a cut', () => {
    const steps = ['a', 'b', 'c', 'd', 'e', 'f']
    expect(planSteps(steps, null, 4)).toEqual({ now: ['a', 'b', 'c', 'd'], later: ['e', 'f'] })
    expect(planSteps(steps, 1, 2)).toEqual({ now: ['a', 'b'], later: ['c', 'd', 'e', 'f'] })
    expect(planSteps(steps, null, null).later).toEqual([])
  })

  it('moves the cut with the smaller steps that replace the current one', () => {
    expect(cutAfterUnstick(null, 1, 3)).toBeNull()
    expect(cutAfterUnstick(5, 1, 3)).toBe(6)
    expect(cutAfterUnstick(2, 3, 2)).toBe(2)
  })
})

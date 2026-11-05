import { describe, expect, it } from 'vitest'
import { planSteps } from '../decode/model'
import { cutAfterLow, cutAfterUnstick, moodDue, moodLevel } from './model'

// Walks a plan of `total` steps the way the overlay does and returns the steps after which Pip asks.
function asksFor(total: number): number[] {
  let asked = false
  const at: number[] = []
  for (let done = 1; done <= total; done++) {
    if (moodDue({ total, done, asked })) {
      at.push(done)
      asked = true
    }
  }
  return at
}

describe('moodDue', () => {
  it('asks once, halfway through the steps', () => {
    expect(asksFor(6)).toEqual([3])
    expect(asksFor(5)).toEqual([3])
    expect(asksFor(4)).toEqual([2])
    expect(asksFor(3)).toEqual([2])
    expect(asksFor(2)).toEqual([1])
  })

  it('never asks on a single step', () => {
    expect(asksFor(1)).toEqual([])
  })

  it('does not ask again once it asked', () => {
    expect(moodDue({ total: 6, done: 3, asked: true })).toBe(false)
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

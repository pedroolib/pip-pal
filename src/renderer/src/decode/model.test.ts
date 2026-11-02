import { describe, expect, it } from 'vitest'
import type { Classification } from '@shared/schemas'
import { planSteps, segments, showAsk } from './model'

describe('planSteps', () => {
  const steps = ['a', 'b', 'c', 'd', 'e']

  it('shows every step when spoons are unknown or fine', () => {
    expect(planSteps(steps, null)).toEqual({ now: steps, later: [] })
    expect(planSteps(steps, 3)).toEqual({ now: steps, later: [] })
  })

  it('keeps 3 steps and moves the rest to later with 2 spoons or fewer', () => {
    expect(planSteps(steps, 2)).toEqual({ now: ['a', 'b', 'c'], later: ['d', 'e'] })
    expect(planSteps(steps, 1).now).toHaveLength(3)
  })

  it('has nothing for later when the plan is short', () => {
    expect(planSteps(['a'], 1)).toEqual({ now: ['a'], later: [] })
  })
})

describe('showAsk', () => {
  const c = (isAmbiguous: number): Classification => ({
    isChange: 0,
    changeType: 'none',
    tone: 'neutral',
    urgency: 1,
    isAmbiguous,
    source: 'jev'
  })

  it('asks only when the message is ambiguous and there is a question to ask', () => {
    expect(showAsk(c(0.81), [{}])).toBe(true)
    expect(showAsk(c(0.3), [{}])).toBe(false)
    expect(showAsk(c(0.9), [])).toBe(false)
  })
})

describe('segments', () => {
  it('marks finished, current and upcoming steps', () => {
    expect(segments(4, 1)).toEqual(['done', 'current', 'todo', 'todo'])
    expect(segments(2, 2)).toEqual(['done', 'done'])
  })
})

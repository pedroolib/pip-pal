import { describe, expect, it } from 'vitest'
import type { Achievement } from '@shared/schemas'
import { groupByDay, isToday, latest } from './days'

const a = (at: string, label: string): Achievement => ({ at, kind: 'step_done', label })

describe('days', () => {
  const list = [
    a('2026-10-27T11:00:00', 'old'),
    a('2026-10-30T12:15:00', 'new'),
    a('2026-10-30T09:00:00', 'new earlier')
  ]

  it('sorts newest first', () => expect(latest(list)?.label).toBe('new'))

  it('groups by calendar day, newest day and newest item first', () => {
    const groups = groupByDay(list)
    expect(groups.map((g) => g.items.map((i) => i.label))).toEqual([
      ['new', 'new earlier'],
      ['old']
    ])
  })

  it('returns nothing for an empty list', () => {
    expect(groupByDay([])).toEqual([])
    expect(latest([])).toBeUndefined()
  })

  it('knows what is today', () => {
    const now = new Date('2026-11-02T10:00:00')
    expect(isToday('2026-11-02T08:00:00', now)).toBe(true)
    expect(isToday('2026-11-01T23:59:00', now)).toBe(false)
  })
})

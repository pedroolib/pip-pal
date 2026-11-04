import { describe, expect, it } from 'vitest'
import type { Reminder } from '@shared/schemas'
import { addDue, oldestFirst, refreshDue } from './dueQueue'

const NOW = new Date('2026-11-03T12:00:00.000Z')
const r = (id: string, at: string, text = id): Reminder => ({ id, text, at })
const ids = (queue: Reminder[]): string[] => queue.map((x) => x.id)

describe('addDue', () => {
  it('shows the oldest first, whatever order they arrive in', () => {
    const queue = addDue(
      addDue([], r('late', '2026-11-03T11:00:00.000Z')),
      r('early', '2026-11-03T09:00:00.000Z')
    )
    expect(ids(queue)).toEqual(['early', 'late'])
  })

  it('keeps one entry per reminder, with the newest words', () => {
    const queue = addDue(
      [r('a', '2026-11-03T09:00:00.000Z', 'old words')],
      r('a', '2026-11-03T09:00:00.000Z', 'new words')
    )
    expect(queue).toEqual([r('a', '2026-11-03T09:00:00.000Z', 'new words')])
  })
})

describe('refreshDue', () => {
  const a = r('a', '2026-11-03T09:00:00.000Z')
  const b = r('b', '2026-11-03T10:00:00.000Z')

  it('drops a reminder deleted while it waited', () => {
    expect(ids(refreshDue([a, b], [b], NOW))).toEqual(['b'])
  })

  it('takes the edited words of a reminder that is still due', () => {
    const edited = { ...a, text: 'edited' }
    expect(refreshDue([a], [edited], NOW)).toEqual([edited])
  })

  it('drops a reminder moved to the future: main fires it again at the new time', () => {
    const moved = { ...a, at: '2026-11-03T15:00:00.000Z' }
    expect(refreshDue([a], [moved], NOW)).toEqual([])
  })

  it('leaves out reminders that were never due', () => {
    expect(refreshDue([a], [a, r('future', '2026-11-04T09:00:00.000Z')], NOW)).toEqual([a])
  })
})

describe('oldestFirst', () => {
  it('orders by the moment, not the text, across offsets', () => {
    const late = r('late', '2026-11-03T12:00:00.000Z')
    const early = r('early', '2026-11-03T13:00:00.000+02:00')
    expect(ids([late, early].sort(oldestFirst))).toEqual(['early', 'late'])
  })
})

import { describe, expect, it } from 'vitest'
import { activeIndex, removeAt, removeById, upsert } from './model'

describe('manual list edits', () => {
  it('adds an item and gives it an id', () => {
    const out = upsert([{ id: 'a', text: 'x' }], { text: 'y' })
    expect(out).toHaveLength(2)
    expect(out[1].id).toBeTruthy()
  })

  it('replaces the item with the same id, keeping order', () => {
    const out = upsert(
      [
        { id: 'a', text: 'x' },
        { id: 'b', text: 'y' }
      ],
      { id: 'a', text: 'z' }
    )
    expect(out.map((e) => e.text)).toEqual(['z', 'y'])
  })

  it('removes by id and by index', () => {
    expect(removeById([{ id: 'a' }, { id: 'b' }], 'a')).toEqual([{ id: 'b' }])
    expect(removeAt(['p', 'q', 'r'], 1)).toEqual(['p', 'r'])
  })
})

describe('activeIndex', () => {
  it('picks the last section whose top passed 30% of the viewport', () => {
    expect(activeIndex([-500, -100, 200, 900], 1000, false)).toBe(2)
    expect(activeIndex([-500, -100, 301, 900], 1000, false)).toBe(1)
  })
  it('falls back to the first when none passed', () => {
    expect(activeIndex([400, 900], 1000, false)).toBe(0)
  })
  it('is the last section at the bottom of the page', () => {
    expect(activeIndex([-900, -400, 600, 800], 1000, true)).toBe(3)
  })
})

import { describe, expect, it } from 'vitest'
import { removeAt, removeById, upsert } from './model'

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

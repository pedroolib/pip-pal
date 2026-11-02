import { describe, expect, it } from 'vitest'
import { ALIAS_MAX, activeIndex, addAlias, removeAt, removeById, upsert } from './model'

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
    expect(activeIndex([-500, -100, 200, 900], 1000, 5000)).toBe(2)
    expect(activeIndex([-500, -100, 301, 900], 1000, 5000)).toBe(1)
  })
  it('falls back to the first when none passed', () => {
    expect(activeIndex([400, 900], 1000, 5000)).toBe(0)
  })

  // 15 sections; the last three (Energy, Calming, People) are short.
  const heights = [...Array(12).fill(600), 150, 150, 150]
  const starts = heights.map((_, i) => 40 + heights.slice(0, i).reduce((a, b) => a + b, 0))
  const vh = 800
  const docH = starts[14] + 150 + 40
  const max = docH - vh
  const at = (y: number): number =>
    activeIndex(
      starts.map((s) => s - y),
      vh,
      max - y
    )
  const down = Array.from({ length: max / 5 + 1 }, (_, k) => at(k * 5))
  const up = [...down].reverse()

  it('visits every section in order scrolling down, including the short last ones', () => {
    expect(down.every((v, i) => i === 0 || v >= down[i - 1])).toBe(true)
    expect(new Set(down).size).toBe(15)
    expect(down.at(-1)).toBe(14)
  })
  it('visits every section in order scrolling back up', () => {
    expect(up.every((v, i) => i === 0 || v <= up[i - 1])).toBe(true)
    expect(new Set(up).size).toBe(15)
    expect(up.at(-1)).toBe(0)
  })
})

describe('addAlias', () => {
  it('adds trimmed text', () => {
    expect(addAlias(['Ally'], '  @alexr ')).toEqual(['Ally', '@alexr'])
  })
  it('ignores empty text and case-insensitive duplicates', () => {
    expect(addAlias(['Ally'], '   ')).toEqual(['Ally'])
    expect(addAlias(['Ally'], 'ALLY')).toEqual(['Ally'])
  })
  it('splits pasted or leftover text on commas', () => {
    expect(addAlias(['a'], 'b, A,, c')).toEqual(['a', 'b', 'c'])
  })
  it('keeps a nickname of exactly the cap and skips one character more', () => {
    expect(addAlias([], 'x'.repeat(ALIAS_MAX))).toEqual(['x'.repeat(ALIAS_MAX)])
    expect(addAlias([], 'x'.repeat(ALIAS_MAX + 1))).toEqual([])
  })
  it('keeps only the short part of a pasted list', () => {
    expect(addAlias([], `a, ${'x'.repeat(ALIAS_MAX + 1)}`)).toEqual(['a'])
  })
})

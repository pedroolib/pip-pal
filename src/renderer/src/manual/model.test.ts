import { describe, expect, it } from 'vitest'
import { ALIAS_MAX } from '@shared/profile'
import {
  activeIndex,
  addAlias,
  aliasesToSave,
  hasTooLongAlias,
  removeAt,
  removeById,
  splitAliases,
  upsert
} from './model'

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
    expect(addAlias(['ab'], 'bo, AB,, cy')).toEqual(['ab', 'bo', 'cy'])
  })
  it('keeps 100 characters and skips 101', () => {
    expect(ALIAS_MAX).toBe(100)
    expect(addAlias([], 'x'.repeat(100))).toEqual(['x'.repeat(100)])
    expect(addAlias([], 'x'.repeat(101))).toEqual([])
  })
  it('skips what the scrubber would ignore, judged on the folded text like the scrubber', () => {
    // 100 typed, but NFKC turns each "ﬃ" into "ffi": 120 once folded, so it is skipped.
    expect(addAlias([], 'ﬃ'.repeat(20) + 'x'.repeat(80))).toEqual([])
    // 120 typed with zero-width spaces, 60 once folded, so it is kept; a leading "@" does not count.
    const zw = 'd\u200b'.repeat(60)
    expect(addAlias([], `${zw}, @${'e'.repeat(100)}`)).toEqual([zw, '@' + 'e'.repeat(100)])
    expect(addAlias([], 'J, @a, J.')).toEqual([])
  })
  it('keeps only the short part of a pasted list', () => {
    expect(addAlias([], `al, ${'x'.repeat(101)}`)).toEqual(['al'])
  })
  it('never keeps a cut-off chip from a pasted list longer than one alias', () => {
    // The box has no 100-character cap, so a long part arrives whole and is skipped, not truncated.
    const pasted = `Ally, ${'Maximiliano'.repeat(9) + 'xx'}, Bo`
    expect(pasted.length).toBeGreaterThan(100)
    expect(addAlias([], pasted)).toEqual(['Ally', 'Bo'])
    expect(hasTooLongAlias(pasted)).toBe(true)
  })
})

describe('hasTooLongAlias', () => {
  it('flags a part dropped only for its length', () => {
    expect(hasTooLongAlias(`al, ${'x'.repeat(101)}`)).toBe(true)
  })
  it('does not flag parts dropped for other reasons or kept ones', () => {
    expect(hasTooLongAlias('J, @a')).toBe(false)
    expect(hasTooLongAlias('12 ' + '-'.repeat(120))).toBe(false)
    expect(hasTooLongAlias('x'.repeat(100))).toBe(false)
  })
})

describe('splitAliases', () => {
  it('turns a 2248-character pasted list into whole chips, none cut off', () => {
    const names = Array.from({ length: 150 }, (_, i) => `Nickname${String(i).padStart(3, '0')}xy`)
    const pasted = names.join(', ')
    expect(pasted.length).toBe(2248)
    expect(splitAliases([], pasted)).toEqual({ aliases: names, left: '' })
  })
  it('keeps a too-long part in the box', () => {
    const long = 'x'.repeat(101)
    expect(splitAliases(['al'], ` bo , ${long}, cy`)).toEqual({
      aliases: ['al', 'bo', 'cy'],
      left: long
    })
  })
})

describe('aliasesToSave', () => {
  it('adds what is left in the box', () => {
    expect(aliasesToSave(['al'], ' bo ')).toEqual(['al', 'bo'])
  })
  it('refuses to save while the box holds a part over the cap, so it is never dropped silently', () => {
    expect(aliasesToSave(['al'], 'x'.repeat(101))).toBeNull()
    expect(aliasesToSave(['al'], `bo, ${'x'.repeat(101)}`)).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { bullets } from './bullets'

describe('bullets', () => {
  it('copies only ticked points as "- " lines', () => {
    const points = [
      { text: 'One', include: true },
      { text: 'Two', include: false },
      { text: 'Three', include: true }
    ]
    expect(bullets(points)).toBe('- One\n- Three')
  })

  it('is empty when nothing is ticked', () => {
    expect(bullets([{ text: 'One', include: false }])).toBe('')
  })
})

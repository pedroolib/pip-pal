import { describe, expect, it } from 'vitest'
import { SECTIONS, type Profile } from '@shared/schemas'
import { addChip, keepWords, nextStep, prevStep } from './model'

const empty: Profile = {
  name: '',
  role: '',
  people: [],
  calmingStrategies: [],
  sections: Object.fromEntries(SECTIONS.map((s) => [s, []])) as unknown as Profile['sections']
}

describe('onboarding model', () => {
  it('walks the steps in order and stops at both ends', () => {
    expect(prevStep('welcome')).toBeNull()
    expect(nextStep('welcome')).toBe('comfort')
    expect(prevStep('review')).toBe('about')
    expect(nextStep('home')).toBeNull()
  })

  it('keeps each answer word for word as a private self entry, skipping blanks', () => {
    const out = keepWords(
      empty,
      { calming: ' music ', sensory: '  ', instructions: 'In writing' },
      (q) => `Q:${q}`
    )
    expect(out.sections.stress).toEqual([
      expect.objectContaining({
        text: 'Q:calming: music',
        origin: 'self',
        visibleTo: [],
        fromAnswer: 'calming'
      })
    ])
    expect(out.sections.communication[0].text).toBe('Q:instructions: In writing')
    expect(out.sections.sensory).toEqual([])
    expect(out.sections.stress[0].id).toBeTruthy()
  })

  it('a chip adds a phrase once', () => {
    expect(addChip(undefined, 'Knowing why')).toBe('Knowing why')
    expect(addChip('In writing.', 'A clear first step')).toBe('In writing, a clear first step')
    expect(addChip('knowing why helps', 'Knowing why')).toBe('knowing why helps')
  })
})

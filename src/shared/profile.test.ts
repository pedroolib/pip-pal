import { describe, expect, it } from 'vitest'
import sam from './fixtures/sam.profile.json'
import { Profile, SECTIONS, type ProfileEntry } from './schemas'
import { buildProfileContext, ensureIds, forRecipient } from './profile'

const sections = (
  some: Partial<Record<(typeof SECTIONS)[number], ProfileEntry[]>>
): Profile['sections'] =>
  Object.fromEntries(SECTIONS.map((s) => [s, some[s] ?? []])) as Profile['sections']

describe('schema', () => {
  it('still parses Sam without ids or pending', () => {
    expect(() => Profile.parse(sam)).not.toThrow()
  })
})

describe('ensureIds', () => {
  it('fills missing ids and is idempotent', () => {
    const once = ensureIds(Profile.parse(sam))
    const all = [...Object.values(once.sections).flat(), ...once.calmingStrategies]
    expect(all.every((e) => typeof e.id === 'string' && e.id.length > 0)).toBe(true)
    expect(new Set(all.map((e) => e.id)).size).toBe(all.length)
    expect(ensureIds(once)).toEqual(once)
  })
})

describe('forRecipient', () => {
  const p = (): Profile => ({
    name: 'Sam',
    role: 'Analyst',
    people: [{ name: 'Alex', role: 'Manager' }],
    sections: sections({
      stress: [
        { text: 'coach only', origin: 'self', visibleTo: ['coach'] },
        { text: 'private', origin: 'self', visibleTo: [] }
      ],
      strengths: [{ text: 'both', origin: 'self', visibleTo: ['coach', 'manager'] }]
    }),
    calmingStrategies: [
      { label: 'Walk', minutes: 5, origin: 'self', visibleTo: ['coach'] },
      { label: 'Secret', minutes: 2, origin: 'self', visibleTo: [] }
    ],
    pending: [{ id: 'x', section: 'stress', text: 'p', origin: 'pip', visibleTo: ['manager'] }]
  })

  it('never shows a coach-only entry to the manager, and drops empty sections', () => {
    const m = forRecipient(p(), 'manager')
    expect(m.sections.stress).toEqual([])
    expect(m.sections.strengths.map((e) => e.text)).toEqual(['both'])
    expect(m.calmingStrategies).toEqual([])
  })

  it('keeps matching entries and strategies for the coach, hides private ones', () => {
    const c = forRecipient(p(), 'coach')
    expect(c.sections.stress.map((e) => e.text)).toEqual(['coach only'])
    expect(c.calmingStrategies.map((s) => s.label)).toEqual(['Walk'])
  })

  it('removes people and pending for recipients', () => {
    const c = forRecipient(p(), 'coach')
    expect(c.people).toEqual([])
    expect(c.pending).toBeUndefined()
  })
})

describe('buildProfileContext', () => {
  const profile: Profile = {
    name: 'Sam',
    role: 'Analyst',
    people: [{ name: 'Alex', role: 'Manager' }],
    sections: sections({
      feedback: [
        {
          text: 'Alex gives me feedback in writing. alexis is fine',
          origin: 'coach',
          visibleTo: []
        }
      ]
    }),
    calmingStrategies: [{ label: 'Walk with Alex', minutes: 5, origin: 'self', visibleTo: [] }],
    pending: [{ id: 'x', section: 'stress', text: 'PENDINGTEXT', origin: 'pip', visibleTo: [] }]
  }

  it('swaps names for roles everywhere, tags origin, lists calming strategies', () => {
    const out = buildProfileContext(profile)
    expect(out).not.toMatch(/\bAlex\b/)
    expect(out).toContain('[Manager] gives me feedback in writing')
    expect(out).toContain('alexis is fine')
    expect(out).toContain('(coach)')
    expect(out).toContain('Walk with [Manager] (5 min)')
  })

  it('excludes pending', () => {
    expect(buildProfileContext(profile)).not.toContain('PENDINGTEXT')
  })
})

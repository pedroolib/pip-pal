import { describe, expect, it } from 'vitest'
import sam from './fixtures/sam.profile.json'
import { Profile, SECTIONS, type ProfileEntry } from './schemas'
import demo from './fixtures/demo.decoded.json'
import {
  buildProfileContext,
  ensureIds,
  forRecipient,
  restoreDecoded,
  scrubForModel
} from './profile'

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

  it('swaps case-insensitively, trims names, and keeps $ patterns in roles literal', () => {
    const out = buildProfileContext({
      ...profile,
      people: [
        { name: 'Alex ', role: 'Manager' },
        { name: 'Dana', role: '$&' }
      ],
      sections: sections({
        feedback: [{ text: 'ALEX and alex met Dana', origin: 'self', visibleTo: [] }]
      }),
      calmingStrategies: []
    })
    expect(out).toContain('[Manager] and [Manager] met [$&]')
    expect(out).not.toMatch(/alex|Dana/i)
  })

  it('replaces the owner name with [Me] everywhere, case-insensitively', () => {
    const out = buildProfileContext({
      ...profile,
      sections: sections({
        feedback: [
          { text: 'Sam likes it when SAM is told early; sam agrees', origin: 'self', visibleTo: [] }
        ]
      }),
      calmingStrategies: [{ label: 'Sam walks', minutes: 5, origin: 'self', visibleTo: [] }]
    })
    expect(out.split('\n')[0]).toBe('[Me], Analyst')
    expect(out).toContain('[Me] likes it when [Me] is told early; [Me] agrees')
    expect(out).toContain('[Me] walks (5 min)')
    expect(out).not.toMatch(/sam/i)
  })

  it('lets a person with the owner name win', () => {
    const out = buildProfileContext({
      ...profile,
      people: [{ name: 'Sam', role: 'Buddy' }],
      sections: sections({ feedback: [{ text: 'Sam helps', origin: 'self', visibleTo: [] }] })
    })
    expect(out).toContain('[Buddy] helps')
  })

  it('swaps in a single pass so roles are never re-scanned', () => {
    const out = buildProfileContext({
      ...profile,
      people: [
        { name: 'Ana Maria', role: 'Lead' },
        { name: 'Bo', role: "Ana Maria's assistant" }
      ],
      sections: sections({
        feedback: [{ text: 'Bo said hi to Ana Maria', origin: 'self', visibleTo: [] }]
      }),
      calmingStrategies: []
    })
    expect(out).toContain("[Lead's assistant] said hi to [Lead]")
  })

  it('scrubs names inside roles: owner becomes Me, own name cannot leak or loop', () => {
    const out = buildProfileContext({
      ...profile,
      role: 'Analyst working for Bo',
      people: [
        { name: 'Bo', role: 'Sam mentor' },
        { name: 'Cy', role: 'Cy $& again' }
      ],
      sections: sections({ feedback: [{ text: 'Bo and Cy', origin: 'self', visibleTo: [] }] }),
      calmingStrategies: []
    })
    expect(out).toContain('[Me], Analyst working for Me mentor')
    expect(out).toContain('[Me mentor] and [this person $& again]')
    expect(out).not.toMatch(/\b(sam|cy|bo)\b/i)
  })

  it('removes emails, links and phones from entries, strategies and roles', () => {
    const out = buildProfileContext({
      ...profile,
      role: 'Analyst, sam@corp.com',
      people: [{ name: 'Alex', role: 'Manager at 555-123-4567' }],
      sections: sections({
        feedback: [
          {
            text: 'Email ana.lopez@acme.com or call +52 55 1234 5678; wiki https://acme.com/sam',
            origin: 'self',
            visibleTo: []
          },
          { text: 'Alex helps', origin: 'self', visibleTo: [] }
        ]
      }),
      calmingStrategies: [
        { label: 'Call mom at 555-123-4567', minutes: 5, origin: 'self', visibleTo: [] }
      ]
    })
    expect(out.split('\n')[0]).toBe('[Me], Analyst, [email]')
    expect(out).toContain('- Email [email] or call [phone]; wiki [link] (self)')
    expect(out).toContain('- [Manager at [phone]] helps (self)')
    expect(out).toContain('- Call mom at [phone] (5 min) (self)')
    expect(out).not.toMatch(/@|555|acme|https/)
  })

  it('excludes pending', () => {
    expect(buildProfileContext(profile)).not.toContain('PENDINGTEXT')
  })
})

describe('scrubForModel', () => {
  const p = (people: Profile['people'] = []): Profile => ({
    name: 'Sam',
    role: 'Analyst',
    people,
    sections: sections({}),
    calmingStrategies: []
  })
  const alex = { name: 'Alex', role: 'Manager' }
  const dana = { name: 'Dana', role: 'Coach' }

  it('swaps several names in one pass, case-insensitively, trimmed, $& literal', () => {
    const { text } = scrubForModel(
      'ALEX told sam and dana $& ok',
      p([{ ...alex, name: ' Alex ' }, dana])
    )
    expect(text).toBe('[Manager] told [Me] and [Coach] $& ok')
  })

  it('leaves names inside longer words alone and prefers the longest name', () => {
    const { text } = scrubForModel(
      'Alexander and Ana Maria, Ana',
      p([alex, { name: 'Ana', role: 'Peer' }, { name: 'Ana Maria', role: 'Lead' }])
    )
    expect(text).toBe('Alexander and [Lead], [Peer]')
  })

  it('round-trips names; people sharing a role get numbered tokens', () => {
    const profile = p([alex, { name: 'Bo', role: 'manager' }, dana])
    const { text, restore } = scrubForModel('Alex and Bo and Dana and Sam', profile)
    expect(text).toBe('[Manager 1] and [manager 2] and [Coach] and [Me]')
    expect(restore(text)).toBe('Alex and Bo and Dana and Sam')
    const one = scrubForModel('Dana and Sam', p([dana]))
    expect(one.restore(one.text)).toBe('Dana and Sam')
    expect(one.restore('[Unknown] [coach]')).toBe('[Unknown] Dana')
  })

  it('removes emails, links and phones, and does not restore them', () => {
    const input = [
      'mail sam@corp.com or a.b+c@mail.example.org',
      'see https://x.io/a?b=1&c=2, www.corp.com/path. and corp.com',
      'call +52 55 1234 5678, (555) 123-4567 or 555.123.4567'
    ].join('\n')
    const { text, restore } = scrubForModel(input, p())
    expect(text).toBe(
      [
        'mail [email] or [email]',
        'see [link], [link]. and [link]',
        'call [phone], [phone] or [phone]'
      ].join('\n')
    )
    expect(restore(text)).toBe(text)
  })

  it('keeps dates, short numbers and plain text', () => {
    const t = 'On 2026-11-01 at 10:30, 3 of 12 tasks. e.g. done.'
    expect(scrubForModel(t, p()).text).toBe(t)
  })

  it('swaps partial names: owner words to [Me], a person to their token, shared words to [someone]', () => {
    const profile = {
      ...p([
        { name: 'Ana María López', role: 'Manager' },
        { name: 'Luis Rivera', role: 'Peer' },
        { name: 'Eva de Luna', role: 'Coach' }
      ]),
      name: 'Sam Rivera'
    }
    const { text, restore } = scrubForModel(
      'Hi Sam. López agrees, ask Ana. Rivera, Sam Rivera, Luis, de Luna',
      profile
    )
    expect(text).toBe(
      'Hi [Me]. [Manager] agrees, ask [Manager]. [someone], [Me], [Peer], de [Coach]'
    )
    expect(restore(text)).toBe(
      'Hi Sam Rivera. Ana María López agrees, ask Ana María López. [someone], Sam Rivera, Luis Rivera, de Eva de Luna'
    )
  })

  it('matches names across NFD, non-breaking spaces and missing accents, keeping other accents', () => {
    const profile = p([
      { name: 'José', role: 'Lead' },
      { name: 'Ana María López', role: 'Manager' },
      { name: 'Raúl', role: 'Peer' }
    ])
    const scrub = (t: string): string => scrubForModel(t, profile).text
    expect(scrub('José dijo que mañana')).toBe('[Lead] dijo que mañana')
    expect(scrub('Jose y Ana María López')).toBe('[Lead] y [Manager]')
    expect(scrub('JOSÉ, ANA MARIA LOPEZ y Raúl')).toBe('[Lead], [Manager] y [Peer]')
  })

  it('removes back-to-back phones and phones glued to letters, keeps ISO date runs', () => {
    const scrub = (t: string): string => scrubForModel(t, p()).text
    expect(scrub('Call 55 1234 5678 55 8765 4321')).toBe('Call [phone]')
    expect(scrub('tel5512345678 or ph5512345678')).toBe('tel[phone] or ph[phone]')
    expect(scrub('From 2026-11-01 2026-11-15 on')).toBe('From 2026-11-01 2026-11-15 on')
    // shortcut pinned: digit runs read as a phone
    expect(scrub('tasks 10 20 30 40')).toBe('tasks [phone]')
  })

  it('shortcut pinned: a bare domain with an unlisted TLD is not removed', () => {
    expect(scrubForModel('see startup.xyz/team', p()).text).toBe('see startup.xyz/team')
  })

  it('removes an email even when it contains a name', () => {
    expect(scrubForModel('alex@corp.com', p([alex])).text).toBe('[email]')
  })

  it('restoreDecoded restores every string and keeps the shape', () => {
    const d = structuredClone(demo) as unknown as Parameters<typeof restoreDecoded>[0]
    d.decode.summary = 'Ask [Manager] about it'
    const out = restoreDecoded(d, (s) => s.replace('[Manager]', 'Alex'))
    expect(out.decode.summary).toBe('Ask Alex about it')
    expect(out.fromCache).toBe(d.fromCache)
    expect(Object.keys(out)).toEqual(Object.keys(d))
  })
})

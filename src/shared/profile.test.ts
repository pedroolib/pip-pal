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
    expect(out).toContain('- [Manager at] helps (self)')
    expect(out).toContain('- Call mom at [phone] (5 min) (self)')
    expect(out).not.toMatch(/@|555|acme|https/)
  })

  it('excludes pending', () => {
    expect(buildProfileContext(profile)).not.toContain('PENDINGTEXT')
  })

  it('keeps the Sam context byte-identical (no identifiers in it)', () => {
    expect(buildProfileContext(Profile.parse(sam))).toMatchInlineSnapshot(`
      "[Me], Junior data analyst, 4 months in (first job)

      ## experience
      - Degree in statistics. Built personal projects in Python and SQL before this job. (coach)

      ## languages
      - Spanish (native), English (professional, prefers it in writing). (coach)

      ## communication
      - Prefers written instructions over spoken ones; spoken requests are easy to lose. (coach)
      - Is direct in writing; short replies can read as cold even when they are not meant to. (coach)

      ## teamwork
      - Works best with one clear owner per task and a known person to ask. (coach)

      ## feedback
      - Wants feedback that is specific and written down, with an example of what good looks like. (coach)

      ## stress
      - Vague deadlines ("when you get a chance", "soon") are the main stress trigger. (coach)
      - Under stress, delays replying to messages instead of asking. (coach)

      ## relationships
      - Builds trust slowly; one-to-one works better than group chats. (coach)

      ## sensory
      - Open-plan noise after lunch is draining; noise-cancelling headphones help. (coach)

      ## motivations
      - Clean, correct data and knowing the work is used by someone. (self)

      ## strengths
      - Spots patterns and errors others miss; follows processes carefully. (coach)

      ## learning
      - Learns best from a written example, then trying it alone. (coach)
      - Prefers a task broken into small, concrete steps, each one saying what done looks like, so nothing is left to guess. (coach)

      ## changes
      - Needs the why of a change first, then who to ask and by when. (coach)
      - Same-day changes are hard; a few days' notice makes a big difference. (self)

      ## adjustments
      - Instructions in writing, with an explicit deadline. (coach)
      - Lunch 30 minutes before the team to avoid the busy cafeteria. (coach)

      ## managerTips
      - Follow a spoken request with a two-line message: what, by when. (coach)

      ## calmingStrategies
      - Listen to calm music (10 min) (self)
      - Colouring (15 min) (self)
      - Short walk outside (10 min) (coach)"
    `)
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

  describe('restore of a shortened role token', () => {
    const dana2 = { name: 'Dana Ruiz', role: 'Teammate on the forecasting project' }

    it('restores the exact token and a unique whole-word prefix of it, in any case', () => {
      const { restore } = scrubForModel('hi', p([alex, dana2]))
      expect(restore('ask [Teammate on the forecasting project]')).toBe('ask Dana Ruiz')
      expect(restore('ask [Teammate] and [teammate on the]')).toBe('ask Dana Ruiz and Dana Ruiz')
      expect(restore('[Manager] said')).toBe('Alex said')
    })

    it('leaves a prefix shared by two tokens alone', () => {
      const lead = { name: 'Rui Costa', role: 'Teammate on support' }
      const { restore } = scrubForModel('hi', p([alex, dana2, lead]))
      expect(restore('[Teammate] and [Teammate on]')).toBe('[Teammate] and [Teammate on]')
      expect(restore('[Teammate on support]')).toBe('Rui Costa')
    })

    it('never matches part of a word, a longer token, or something else', () => {
      const { restore } = scrubForModel('hi', p([dana2]))
      for (const s of ['[Team]', '[Teammate on the forecast]', '[forecasting project]'])
        expect(restore(s)).toBe(s)
      expect(restore('[Teammate on the forecasting project today]')).toBe(
        '[Teammate on the forecasting project today]'
      )
    })

    it('leaves the fixed tokens alone, even when a role starts with their word', () => {
      const people = [
        { name: 'Dana Ruiz', role: 'Person in charge of payroll' },
        { name: 'Rui Costa', role: 'Someone from legal' },
        { name: 'Bo Li', role: 'Link to the design team' },
        { name: 'Kim Park', role: 'Me and my mentor' }
      ]
      const { restore } = scrubForModel('hi', p(people))
      for (const s of ['[person]', '[someone]', '[Link]', '[email]', '[phone]', '[handle]'])
        expect(restore(s)).toBe(s)
      expect(restore('[Me]')).toBe('Sam')
      expect(restore('[Person in charge]')).toBe('Dana Ruiz')
    })

    it('restores numbered tokens only exactly', () => {
      const bo = { name: 'Bo Li', role: 'Manager of data' }
      const kim = { name: 'Kim Park', role: 'Manager of data' }
      const { text, restore } = scrubForModel('Bo and Kim', p([bo, kim]))
      expect(text).toBe('[Manager of data 1] and [Manager of data 2]')
      expect(restore(text)).toBe('Bo Li and Kim Park')
      expect(restore('[Manager of data] [Manager]')).toBe('[Manager of data] [Manager]')
    })

    it('keeps clash-suffixed tokens exact: "[Lead 1]" is Bo, never a prefix of "[Lead 1 2]"', () => {
      const people = [
        { name: 'Bo Li', role: 'Lead' },
        { name: 'Kim Park', role: 'Lead' },
        { name: 'Ana Ruiz', role: 'Lead 1' }
      ]
      const { text, restore } = scrubForModel('Bo, Kim, Ana', p(people))
      expect(text).toBe('[Lead 1], [Lead 2], [Lead 1 2]')
      expect(restore(text)).toBe('Bo Li, Kim Park, Ana Ruiz')
      expect(restore('[Lead 1]')).toBe('Bo Li')
      expect(restore('[Lead]')).toBe('[Lead]')
    })
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

  it('removes @handles and catches usernames built from a name', () => {
    const profile = { ...p([alex]), name: 'Sam Rivera' }
    const scrub = (t: string): string => scrubForModel(t, profile).text
    expect(scrub('cc @samrivera and @j.doe-2.')).toBe('cc [handle] and [handle].')
    expect(scrub('sam_rivera, rivera_s, SamRivera, sam123')).toBe(
      '[Me]_[Me], [Me]_s, [Me], [Me]123'
    )
    expect(scrub('mail sam@corp.com')).toBe('mail [email]')
  })

  it('swaps two-letter name words but never particles', () => {
    const profile = {
      ...p([
        { name: 'Jo Park', role: 'Peer' },
        { name: 'María del Carmen', role: 'Lead' }
      ]),
      name: 'Li Bo'
    }
    const scrub = (t: string): string => scrubForModel(t, profile).text
    expect(scrub('Hi Li, Jo said')).toBe('Hi [Me], [Peer] said')
    expect(scrub('María del Carmen: reunión del lunes')).toBe('[Lead]: reunión del lunes')
  })

  it('swaps hyphenated names whole, spaced, and by each part', () => {
    const { text, restore } = scrubForModel(
      'Dana-Lee, Dana Lee, Dana and Lee; Dana‑Lee',
      p([{ name: 'Dana-Lee', role: 'Coach' }])
    )
    expect(text).toBe('[Coach], [Coach], [Coach] and [Coach]; [Coach]')
    expect(restore('[Coach]')).toBe('Dana-Lee')
  })

  it('matches straight, curly and missing apostrophes', () => {
    const scrub = (t: string): string =>
      scrubForModel(t, p([{ name: "O'Brien", role: 'Lead' }])).text
    expect(scrub("O’Brien, OBrien, O'Brien, O´Brien and O‘Brien’s")).toBe(
      '[Lead], [Lead], [Lead], [Lead] and [Lead]’s'
    )
  })

  it('matches Latin Extended Additional letters and names followed by a combining mark', () => {
    const profile = p([
      { name: 'Nguyễn Thị Hương', role: 'Lead' },
      { name: 'Ḥasan Ṣāliḥ', role: 'Peer' },
      { name: 'Olsen', role: 'Coach' }
    ])
    const scrub = (t: string): string => scrubForModel(t, profile).text
    expect(scrub('Nguyễn said, NGUYỄN and Nguyen')).toBe('[Lead] said, [Lead] and [Lead]')
    expect(scrub('Ḥasan Ṣāliḥ and Hasan')).toBe('[Peer] and [Peer]')
    expect(scrub('Olsen͏, Olsen️ and Olsen̲ ok')).toBe('[Coach], [Coach] and [Coach] ok')
    const { text, restore } = scrubForModel('Nguyễn Thị Hương said', profile)
    expect(restore(text)).toBe('Nguyễn Thị Hương said')
  })

  it.each([
    ['สมศักดิ์', 'สมศักดิ์ said', '[Lead] said'],
    ['สมศักดิ์', 'สมศักดิ์บอกว่า', '[Lead]บอกว่า'],
    ['राहुल शर्मा', 'राहुल said', '[Lead] said'],
    ['ごとう', 'ごとうさんが言いました', '[Lead]さんが言いました'],
    ['ガブリエル', 'ガブリエル said', '[Lead] said'],
    ['রহিম', 'রহিম said', '[Lead] said'],
    ['கார்த்திக்', 'கார்த்திக் said', '[Lead] said']
  ])('scrubs and restores %s spelled with its own combining marks', (name, message, scrubbed) => {
    const { text, restore } = scrubForModel(message, p([{ name, role: 'Lead' }]))
    expect(text).toBe(scrubbed)
    expect(restore(text)).toBe(message.replace('राहुल said', 'राहुल शर्मा said')) // a name part restores to the full name
  })

  it('matches apostrophe surnames inside longer names; a part restores to the full name', () => {
    const profile = p([
      { name: "Siobhán O'Brien", role: 'PM' },
      { name: "Liam O'Neill", role: 'Peer' },
      { name: "D'Angelo Smith", role: 'Lead' }
    ])
    const scrub = (t: string): string => scrubForModel(t, profile).text
    expect(scrub('OBrien, O’Brien, Oʼbrien, ONeill, DAngelo')).toBe(
      '[PM], [PM], [PM], [Peer], [Lead]'
    )
    const { text, restore } = scrubForModel('ask O’Brien and Liam', profile)
    expect(restore(text)).toBe("ask Siobhán O'Brien and Liam O'Neill")
  })

  it('matches hyphenated first names written as one word', () => {
    const profile = p([
      { name: 'Jean-Pierre Dupont', role: 'Manager' },
      { name: 'Mary-Kate Olsen', role: 'Peer' },
      { name: 'Ana-Sofía García', role: 'Lead' }
    ])
    expect(scrubForModel('JeanPierre said, MaryKate and AnaSofía', profile).text).toBe(
      '[Manager] said, [Peer] and [Lead]'
    )
  })

  it('keeps clock times after @ and still removes handles', () => {
    expect(scrubForModel('lunch @10am, cc @dana', p()).text).toBe('lunch @10am, cc [handle]')
  })

  it('skips names with no letters or digits instead of matching the empty string', () => {
    const profile = p([
      { name: "'", role: 'X' },
      { name: '---', role: 'Y' },
      { name: "'' ''", role: 'Z' }
    ])
    expect(scrubForModel('Hello. ok', profile).text).toBe('Hello. ok')
  })

  it('keeps date plus time, still removes real phones next to it', () => {
    const scrub = (t: string): string => scrubForModel(t, p()).text
    for (const t of ['Meeting 2026-11-01 10:30', 'moved to 2026-11-01 14:30 or 09:00', 'at 10:30'])
      expect(scrub(t)).toBe(t)
    expect(scrub('2026-11-01 5512345678, call 555-123-4567: ok')).toBe(
      '2026-11-01 [phone], call [phone]: ok'
    )
  })

  it('removes zero-width, soft-hyphen and fullwidth tricks', () => {
    expect(scrubForModel('S​am, Sa­m and Ｓａｍ', p()).text).toBe('[Me], [Me] and [Me]')
  })

  it('keeps tokens unique and bracket-free whatever the roles are', () => {
    const profile = p([
      { name: 'Eve', role: 'Me' },
      { name: 'Ana', role: 'Manager' },
      { name: 'Bob', role: 'manager' },
      { name: 'Cy', role: 'Manager 1' },
      { name: 'Di', role: 'email' },
      { name: 'Flo', role: '[Lead]' },
      { name: 'Gus', role: 'call 555-123-4567' },
      { name: 'Hal', role: 'Hal' }
    ])
    const msg = 'Sam, Eve, Ana, Bob, Cy, Di, Flo, Gus, Hal'
    const { text, restore } = scrubForModel(msg, profile)
    const tokens = text.split(', ')
    expect(new Set(tokens.map((t) => t.toLowerCase())).size).toBe(tokens.length)
    for (const t of tokens) expect(t).toMatch(/^\[[^[\]]+\]$/)
    expect(restore(text)).toBe(msg)
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

describe('scrubForModel on real chat text', () => {
  const people = [
    { name: 'Dana-Lee Park', role: 'Peer' },
    { name: "Siobhán O'Neill", role: 'Coach' },
    { name: 'María del Carmen Ruiz', role: 'Lead' },
    { name: 'Jean-Pierre Dupont', role: 'Manager' },
    { name: 'Zoë Ng', role: 'HR' },
    { name: 'Ed', role: 'Buddy' }
  ]
  const profile: Profile = {
    name: 'Li Bo',
    role: 'Analyst',
    people,
    sections: sections({}),
    calmingStrategies: []
  }
  // Output folded the way a reader sees it: no accents, any apostrophe or hyphen splits words.
  const plain = (s: string): string =>
    s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[’'-]/g, ' ')
  const words = (name: string): string[] =>
    plain(name)
      .split(' ')
      .filter((w) => w.length >= 2 && !['de', 'del', 'la'].includes(w))

  // Slack, Teams and Outlook shapes: "Name:" prefix, @mention, curly quotes, ALL CAPS, possessives.
  const shapes = (name: string): string[] => {
    const parts = name.split(/[\s-]+/)
    const first = parts[0]
    const last = parts[parts.length - 1]
    return [
      `${name}: moving standup to 2026-11-01 14:30 or 09:00`,
      `@${first} can you check? cc @${name.replace(/\s+/g, '.').toLowerCase()}`,
      `Per ${last}’s note, “${first}” owns it. Ask ${last}.`,
      `${name.toUpperCase()} WILL COVER, CALL +52 55 1234 5678 OR (555) 123-4567`,
      `Thanks ${name.replace(/'/g, '’')}! ${first}, ${last}; ${last}'s doc at 10:30`
    ]
  }

  for (const who of [{ name: profile.name, role: 'Me' }, ...people]) {
    it(`never sends any word of "${who.name}"`, () => {
      for (const msg of shapes(who.name)) {
        const out = plain(scrubForModel(msg, profile).text)
        for (const w of words(who.name))
          expect(out, msg).not.toMatch(new RegExp(`(?<!\\p{L})${w}(?!\\p{L})`, 'u'))
        expect(out, msg).not.toMatch(/1234|4567/)
      }
    })

    it(`round-trips "${who.name}" and keeps the date and time`, () => {
      const msg = `${who.name} moved it to 2026-11-01 10:30.`
      const { text, restore } = scrubForModel(msg, profile)
      expect(text).toContain('2026-11-01 10:30.')
      expect(restore(text)).toBe(msg)
    })
  }

  it('scrubs an 8000-char message with 50 people in well under 200 ms', () => {
    const syl = ['ka', 'lo', 'mi', 'ra', 'su', 'te', 'vo', 'ne']
    const many = Array.from({ length: 50 }, (_, i) => ({
      name: `${syl[i % 8]}${syl[(i >> 3) % 8]}-${syl[(i + 3) % 8]} O'${syl[(i * 5) % 8]}ñez`,
      role: `Role ${i}`
    }))
    const line = many.map((x) => `${x.name}, 2026-11-01 10:30 +52 55 1234 5678 `).join('')
    const msg = (line + 'a-1 '.repeat(2000)).slice(0, 8000)
    const big = { ...profile, people: many }
    scrubForModel('warm up', big)
    const t = performance.now()
    scrubForModel(msg, big)
    expect(performance.now() - t).toBeLessThan(200)
  })

  it('scrubs hostile 8000-char messages with 200 hyphen and apostrophe names in well under 1 s', () => {
    const syl = ['ka', 'lo', 'mi', 'ra', 'su', 'te', 'vo', 'ne']
    const many = Array.from({ length: 200 }, (_, i) => ({
      name: `${syl[i % 8]}${syl[(i >> 3) % 8]}-${syl[(i + 3) % 8]} D'${syl[(i * 5) % 8]}ễn ${syl[(i >> 5) % 8]}'${syl[i % 7]}`,
      role: `Role ${i}`
    }))
    const big = { ...profile, people: many }
    const hostile = ["a'", 'a-', "ka'", 'kalo-', 'a̲', 'ễ', '@a.', '1-', ' a']
    scrubForModel('warm up', big)
    for (const unit of hostile) {
      const msg = unit.repeat(8000).slice(0, 8000)
      const t = performance.now()
      scrubForModel(msg, big)
      expect(performance.now() - t, unit).toBeLessThan(1000)
    }
  })

  describe('scripts without spaces', () => {
    const cjk = [
      { name: '김민수', role: 'Peer', msg: ['김민수 said hi', '김민수가 왔어요'] },
      { name: '王伟', role: 'Lead', msg: ['王伟说明天开会'] },
      { name: '田中', role: 'Buddy', msg: ['田中さんが言いました'] },
      { name: 'สมชาย', role: 'HR', msg: ['สมชายบอกว่า'] },
      { name: 'Dana', role: 'Coach', msg: ['D҉a҉n҉a҉ sent it'] }
    ]
    for (const c of cjk)
      for (const msg of c.msg)
        it(`scrubs and restores "${c.name}" in "${msg}"`, () => {
          const p = { ...profile, people: [{ name: c.name, role: c.role }] }
          const { text, restore } = scrubForModel(msg, p)
          expect(text.normalize('NFC')).not.toContain(c.name)
          expect(text).not.toMatch(/D.?a.?n.?a/)
          // restore gives back the stored name, so marks the sender added are dropped
          expect(restore(text)).toBe(msg.replace(/D.*?a.*?n.*?a.*?(?= sent)/u, 'Dana'))
        })

    const more = [
      // Greek, Cyrillic, Arabic and Hebrew marks fold, so accent or vowel-point differences still match
      { name: 'Γιώργος', msg: ['ΓΙΩΡΓΟΣ sent it', 'Γιωργος sent it', 'Γιώργος sent it'] },
      { name: 'Пётр', msg: ['Петр sent it', 'Пётр sent it'] },
      { name: 'Андрій', msg: ['Андрій sent it'] },
      { name: 'مُحَمَّد', msg: ['محمد sent it'] },
      { name: 'آدم', msg: ['آدم sent it'] },
      { name: 'إبراهيم', msg: ['إبراهيم sent it'] },
      { name: 'أحمد', msg: ['أحمد sent it'] },
      { name: 'דָּוִד', msg: ['דוד sent it'] },
      // Latin names glued to scripts written without spaces
      {
        name: 'Dana',
        msg: ['Danaさんが言いました', '我跟Dana说了', 'Dana씨가 내일', 'Danaบอกว่า']
      },
      { name: 'အောင်ကျော်', msg: ['အောင်ကျော်ကပြောတယ်'] },
      { name: 'សុខា', msg: ['សុខាបាននិយាយ'] },
      { name: 'ສົມສັກ', msg: ['ສົມສັກເວົ້າວ່າ'] }
    ]
    for (const c of more)
      for (const msg of c.msg)
        it(`scrubs and restores "${c.name}" in "${msg}"`, () => {
          const p = { ...profile, people: [{ name: c.name, role: 'Peer' }] }
          const { text, restore } = scrubForModel(msg, p)
          expect(text).not.toContain(c.name)
          expect(restore(text)).toContain(c.name)
        })

    it('keeps the word boundary for Latin keys next to a CJK key', () => {
      const p = {
        ...profile,
        people: [
          { name: 'Sam', role: 'Peer' },
          { name: '王伟', role: 'Lead' }
        ]
      }
      expect(scrubForModel('Samsung and 王伟说 Sam', p).text).toMatch(/^Samsung and .+ .+$/)
      expect(scrubForModel('Samsung', p).text).toBe('Samsung')
    })

    it('stays under 1 s with a CJK key among 200 hostile names', () => {
      const syl = ['ka', 'lo', 'mi', 'ra', 'su', 'te', 'vo', 'ne']
      const many = [
        ...['王伟', 'Γιώργος', 'Пётр', 'مُحَمَّد', 'דָּוִד', 'အောင်ကျော်'].map((name) => ({
          name,
          role: 'Lead'
        })),
        ...Array.from({ length: 200 }, (_, i) => ({
          name: `${syl[i % 8]}${syl[(i >> 3) % 8]}-${syl[(i + 3) % 8]} D'${syl[(i * 5) % 8]}ễn`,
          role: `Role ${i}`
        }))
      ]
      const big = { ...profile, people: many }
      scrubForModel('warm up', big)
      for (const unit of ["a'", 'a-', '王', ' a', 'Γ', 'П', 'م', 'ד', '字Dana']) {
        const t = performance.now()
        scrubForModel(unit.repeat(8000).slice(0, 8000), big)
        expect(performance.now() - t, unit).toBeLessThan(1000)
      }
    })
  })
})

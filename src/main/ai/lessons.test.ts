import { describe, expect, it } from 'vitest'
import samJson from '@shared/fixtures/sam.profile.json'
import { Profile, type Lesson } from '@shared/schemas'
import type { ClaudeJsonClient } from './expand'
import {
  applyMerge,
  applyNote,
  createMerger,
  createRememberer,
  StoredLesson,
  type LessonStore
} from './lessons'

const sam = Profile.parse(samJson) // owner Sam; people Alex (Manager), Dana, Rui
const now = (): Date => new Date('2026-11-02T09:00:00Z')
const AT = '2026-11-02T09:00:00.000Z'
const note = (text: string, id = 'n1'): Lesson => ({ id, text, origin: 'self', at: 'x' })

function memory(start: Lesson[] = []): LessonStore & { writes: () => number } {
  let list = start
  let writes = 0
  return {
    list: () => list,
    replace: (l) => {
      list = l
      writes++
    },
    writes: () => writes
  }
}

const decide = (d: Record<string, unknown>): unknown => ({
  decision: 'add',
  text: '',
  noteId: null,
  section: null,
  why: 'Why it was chosen.',
  ...d
})

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- test helper, the returned shape is the point
function setup(reply: unknown, start: Lesson[] = [], during?: (store: LessonStore) => void) {
  const store = memory(start)
  const sent: string[] = []
  let profile = sam
  const claude: ClaudeJsonClient = {
    ask: async ({ system, user }) => {
      sent.push(system, user)
      during?.(store)
      if (reply instanceof Error) throw reply
      return reply
    }
  }
  const remember = createRememberer({
    claude,
    lessons: store,
    load: () => profile,
    save: (p) => void (profile = p),
    now
  })
  return { store, sent, remember, pending: () => profile.pending ?? [] }
}

describe('createRememberer', () => {
  it("saves the person's words before asking, so a failed call keeps them", async () => {
    const s = setup(new Error('offline'))
    const out = await s.remember('Alex: upgrade', 'Ask Alex first.')
    expect(s.store.list()).toMatchObject([{ text: 'Ask Alex first.', origin: 'self', at: AT }])
    expect(out).toMatchObject({ kind: 'add', text: 'Ask Alex first.', why: null })
    expect(out?.noteId).toBe(s.store.list()[0].id)
  })

  it('keeps the words on an invalid answer', async () => {
    const s = setup({ decision: 'nonsense' })
    expect(await s.remember('m', 'My words.')).toMatchObject({ kind: 'add', text: 'My words.' })
  })

  it("only proposes an add: Pip's text is not saved until the person keeps it", async () => {
    const s = setup(decide({ text: 'Ask [Manager] before upgrading.' }))
    const out = await s.remember('m', 'ask alex first')
    expect(out).toMatchObject({ kind: 'add', text: 'Ask Alex before upgrading.' })
    expect(s.store.list()).toMatchObject([{ text: 'ask alex first', origin: 'self' }])
  })

  it('only proposes an update, showing the old text', async () => {
    const old = note('VisionX is a submodule.', 'old')
    const s = setup(decide({ decision: 'update', noteId: 'old', text: 'Submodule; fusion.' }), [
      old
    ])
    const out = await s.remember('m', 'it does fusion')
    expect(out).toMatchObject({
      kind: 'update',
      targetId: 'old',
      oldText: 'VisionX is a submodule.',
      text: 'Submodule; fusion.'
    })
    expect(s.store.list().map((l) => l.text)).toEqual(['VisionX is a submodule.', 'it does fusion'])
  })

  it('treats an update of an unknown note as an add', async () => {
    const s = setup(decide({ decision: 'update', noteId: 'nope', text: 'A fact.' }))
    expect(await s.remember('m', 'said')).toMatchObject({ kind: 'add', text: 'A fact.' })
  })

  it('removes a one-off, and gives the words back for "Remember it"', async () => {
    const s = setup(decide({ decision: 'none', why: 'Only this deadline.' }))
    const out = await s.remember('m', 'The deadline is Friday.')
    expect(s.store.list()).toEqual([])
    expect(out).toMatchObject({
      kind: 'none',
      noteId: null,
      text: 'The deadline is Friday.',
      why: 'Only this deadline.'
    })
  })

  it('sends a preference to the suggestions, never to the notes, with names restored', async () => {
    const reply = decide({
      decision: 'profile',
      section: 'communication',
      text: 'Wants fewer steps when [Manager] writes.'
    })
    const s = setup(reply)
    const out = await s.remember('m', 'too many steps for me')
    expect(s.store.list()).toEqual([])
    expect(s.pending()).toMatchObject([
      {
        section: 'communication',
        text: 'Wants fewer steps when Alex writes.',
        why: 'Why it was chosen.',
        origin: 'learned',
        visibleTo: []
      }
    ])
    expect(out).toMatchObject({ kind: 'profile', noteId: null })
  })

  it('does not suggest the same thing twice', async () => {
    const s = setup(decide({ decision: 'profile', section: 'learning', text: 'Fewer steps.' }))
    await s.remember('m', 'too many')
    await s.remember('m', 'way too many')
    expect(s.pending()).toHaveLength(1)
  })

  it('keeps the words when a profile decision has no section', async () => {
    const s = setup(decide({ decision: 'profile', text: 'Fewer steps.' }))
    expect(await s.remember('m', 'too many')).toMatchObject({ kind: 'add', text: 'Fewer steps.' })
    expect(s.store.list()).toHaveLength(1)
  })

  it('scrubs all it sends, including saved notes', async () => {
    const s = setup(decide({ text: 'x' }), [note('Dana owns the dashboard.', 'n9')])
    await s.remember('Alex: upgrade', 'Rui knows.')
    const all = s.sent.join('\n')
    for (const name of ['Dana', 'Alex', 'Rui']) expect(all).not.toContain(name)
    expect(all).toContain('[n9]')
  })

  it('does not call the model for a duplicate or an empty correction', async () => {
    const s = setup(decide({ text: 'x' }), [note('Package 35 is the bundle.')])
    expect(await s.remember('m', 'package 35 is the BUNDLE.')).toBeNull()
    expect(await s.remember('m', '​​  ')).toBeNull()
    expect(s.sent).toEqual([])
    expect(s.store.writes()).toBe(0)
  })

  it('strips invisible characters and line breaks before saving', async () => {
    const s = setup(new Error('offline'))
    await s.remember('m', ' Vision​X‮ is\n\n a\t\u0007module﻿ ')
    expect(s.store.list()[0].text).toBe('VisionX is a module')
  })

  it('shows nothing if the person deleted the note during the call', async () => {
    const s = setup(decide({ text: 'x' }), [], (store) => store.replace([]))
    expect(await s.remember('m', 'said')).toBeNull()
    expect(s.store.list()).toEqual([])
  })

  it('does not lose a note added during the call', async () => {
    const added = note('Added meanwhile.', 'late')
    const s = setup(decide({ decision: 'none' }), [], (store) =>
      store.replace([...store.list(), added])
    )
    await s.remember('m', 'one-off')
    expect(s.store.list()).toEqual([added])
  })
})

describe('applyNote', () => {
  const words = note('my words', 'w')

  it("Keep swaps the words for Pip's text, marked as Pip's", () => {
    const store = memory([words])
    applyNote(store, { noteId: 'w', targetId: null, text: 'Clean fact.', edited: false }, AT)
    expect(store.list()).toEqual([{ id: 'w', text: 'Clean fact.', origin: 'learned', at: AT }])
  })

  it("Keep on the person's own words stays theirs", () => {
    const store = memory([words])
    applyNote(store, { noteId: 'w', targetId: null, text: 'my words', edited: false }, AT)
    expect(store.list()).toEqual([words])
  })

  it("Edit marks the text as the person's", () => {
    const store = memory([words])
    applyNote(store, { noteId: 'w', targetId: null, text: 'Edited.', edited: true }, AT)
    expect(store.list()[0]).toMatchObject({ text: 'Edited.', origin: 'self' })
  })

  it('Keep on an update changes the target and drops the words', () => {
    const store = memory([note('Old.', 't'), words])
    applyNote(store, { noteId: 'w', targetId: 't', text: 'Old and new.', edited: false }, AT)
    expect(store.list()).toEqual([{ id: 't', text: 'Old and new.', origin: 'learned', at: AT }])
  })

  it('"Remember it" adds a new note in the person\'s words', () => {
    const store = memory()
    applyNote(store, { noteId: null, targetId: null, text: 'Friday.', edited: true }, AT)
    expect(store.list()).toMatchObject([{ text: 'Friday.', origin: 'self', at: AT }])
  })

  it('does not bring back a note deleted since the card showed it', () => {
    const gone = memory()
    applyNote(gone, { noteId: 'w', targetId: null, text: 'Fact.', edited: false }, AT)
    expect(gone.writes()).toBe(0)
    const targetGone = memory([words])
    applyNote(targetGone, { noteId: 'w', targetId: 't', text: 'Old and new.', edited: false }, AT)
    expect(targetGone.list()).toEqual([words])
  })

  it('keeps one copy when the text duplicates another note', () => {
    const store = memory([words, note('Same.', 'same')])
    applyNote(store, { noteId: 'w', targetId: null, text: 'SAME.', edited: false }, AT)
    expect(store.list().map((l) => l.id)).toEqual(['same'])
  })

  it('refuses text with nothing visible in it', () => {
    const store = memory([words])
    expect(() =>
      applyNote(store, { noteId: 'w', targetId: null, text: '​', edited: true }, AT)
    ).toThrow(/needs some text/)
    expect(store.list()).toEqual([words])
  })
})

describe('StoredLesson', () => {
  it('reads the old file format, dropping the message', () => {
    expect(
      StoredLesson.array().parse([
        { message: 'A work message.', correction: 'Ask [Manager].', at: AT },
        note('New shape.')
      ])
    ).toEqual([{ id: AT, text: 'Ask [Manager].', origin: 'learned', at: AT }, note('New shape.')])
  })
})

describe('createMerger', () => {
  const notes = [
    note('Dana owns ETL.', 'a'),
    note('The ETL runs at 3am.', 'b'),
    note('Reports go in SharePoint.', 'c')
  ]
  const merger = (reply: unknown): ReturnType<typeof createMerger> =>
    createMerger({
      claude: { ask: async () => reply },
      lessons: { list: () => notes },
      load: () => sam
    })
  const plan = (m: Record<string, unknown>): unknown => ({
    merges: [{ ids: ['a', 'b'], text: 'ETL: 3am.', why: 'Same thing.', ...m }]
  })

  it('proposes a merge', async () => {
    expect(await merger(plan({}))()).toEqual([
      { ids: ['a', 'b'], text: 'ETL: 3am.', why: 'Same thing.' }
    ])
  })

  it('sends scrubbed notes only, and restores names in the answer', async () => {
    const sent: string[] = []
    const out = await createMerger({
      claude: {
        ask: async ({ user }) => {
          sent.push(user)
          return plan({ text: '[Manager]: ETL.' })
        }
      },
      lessons: { list: () => notes },
      load: () => sam
    })()
    expect(sent[0]).toContain('[a]')
    expect(sent[0]).not.toContain('Dana')
    expect(out[0].text).toBe('Alex: ETL.')
  })

  it.each([
    ['one note', { ids: ['a'] }],
    ['an unknown note', { ids: ['a', 'nope'] }],
    ['the same note twice', { ids: ['a', 'a'] }],
    ['no text', { text: '  ' }],
    ['text that saves no space', { text: 'x'.repeat(100) }],
    ['text that would be cut', { text: 'x'.repeat(1001) }]
  ])('drops a merge with %s', async (_, bad) => {
    expect(await merger(plan(bad))()).toEqual([])
  })

  it('does not use a note in two merges', async () => {
    const out = await merger({
      merges: [
        { ids: ['a', 'b'], text: 'ETL: 3am.', why: 'w' },
        { ids: ['b', 'c'], text: 'Mixed.', why: 'w' }
      ]
    })()
    expect(out.map((m) => m.text)).toEqual(['ETL: 3am.'])
  })

  it('rejects an invalid answer, and needs no call for fewer than 2 notes', async () => {
    await expect(merger({ nope: true })()).rejects.toThrow()
    const ask = async (): Promise<unknown> => {
      throw new Error('should not be called')
    }
    const one = createMerger({
      claude: { ask },
      lessons: { list: () => [notes[0]] },
      load: () => sam
    })
    expect(await one()).toEqual([])
  })
})

describe('applyMerge', () => {
  const merge = { ids: ['a', 'b'], text: 'ETL: 3am.', why: 'w' }

  it("replaces the notes with one, marked as Pip's", () => {
    const store = memory([note('A.', 'a'), note('B.', 'b'), note('C.', 'c')])
    applyMerge(store, merge, AT)
    expect(store.list()).toMatchObject([
      { id: 'c' },
      { text: 'ETL: 3am.', origin: 'learned', at: AT }
    ])
  })

  it('does nothing if one of the notes was deleted', () => {
    const store = memory([note('A.', 'a')])
    applyMerge(store, merge, AT)
    expect(store.writes()).toBe(0)
  })

  it('keeps one copy when the text duplicates another note', () => {
    const store = memory([note('A.', 'a'), note('B.', 'b'), note('etl: 3AM.', 'c')])
    applyMerge(store, merge, AT)
    expect(store.list().map((l) => l.id)).toEqual(['c'])
  })
})

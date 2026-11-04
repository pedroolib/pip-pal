import { describe, expect, it } from 'vitest'
import type { NoteProposal, TellAnswer } from '@shared/schemas'
import { noteToShow } from './tellModel'

const note = (kind: NoteProposal['kind']): NoteProposal => ({
  kind,
  noteId: null,
  targetId: null,
  oldText: null,
  text: 'words',
  why: null
})
const answer = (n: NoteProposal | null): TellAnswer => ({ reply: 'r', why: 'w', note: n })

describe('noteToShow', () => {
  it('hides the strip after a plain question: there is no task and nothing to remember', () => {
    expect(noteToShow(answer(note('none')), false)).toBeNull()
  })

  it.each(['add', 'update', 'profile'] as const)('shows a %s proposal', (kind) => {
    expect(noteToShow(answer(note(kind)), false)?.kind).toBe(kind)
  })

  it('hides it once answered, or with no answer or note', () => {
    expect(noteToShow(answer(note('add')), true)).toBeNull()
    expect(noteToShow(answer(null), false)).toBeNull()
    expect(noteToShow(null, false)).toBeNull()
  })
})

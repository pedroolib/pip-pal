import type { NoteProposal, TellAnswer } from '@shared/schemas'

/** The strip under Pip's answer. After a plain question (`none`) there is no task and nothing kept, so it has nothing to say. */
export function noteToShow(answer: TellAnswer | null, done: boolean): NoteProposal | null {
  const note = answer?.note
  return note && !done && note.kind !== 'none' ? note : null
}

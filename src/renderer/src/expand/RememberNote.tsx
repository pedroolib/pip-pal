// One tap on what Pip wants to remember after a correction (DECISIONS §15). The person's own words are
// already saved, so ignoring this strip keeps them; nothing Pip wrote is used until they press Keep.
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LESSON_MAX, type NoteProposal } from '@shared/schemas'
import { api } from '@renderer/api'
import { Button } from '@renderer/components/ui/button'
import { DictateButton } from '@renderer/record/DictateButton'
import { Textarea } from '@renderer/components/ui/textarea'

export function RememberNote({
  note,
  onDone
}: {
  note: NoteProposal
  onDone: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const field = useRef<HTMLTextAreaElement>(null)
  const editing = draft !== null
  // The overlay is never focused, so it takes the keyboard while the field is open.
  useEffect(() => {
    if (!editing) return
    api.setOverlayFocus(true)
    return () => api.setOverlayFocus(false)
  }, [editing])

  const run = (go: Promise<void>): void => {
    setFailed(false)
    go.then(onDone, () => setFailed(true))
  }
  const save = (text: string, edited: boolean): void =>
    run(api.resolveNote({ noteId: note.noteId, targetId: note.targetId, text, edited }))
  const skip = (): void => (note.noteId ? run(api.deleteLesson(note.noteId)) : onDone())

  return (
    <section role="status" className="flex flex-col gap-2 rounded-lg bg-secondary/60 p-3 text-sm">
      <h2 className="font-bold">{t(`note.${note.kind}`)}</h2>
      {note.oldText && (
        <p className="text-body">
          {t('note.was')} {note.oldText}
        </p>
      )}
      {editing ? (
        <>
          <Textarea
            ref={field}
            autoFocus
            value={draft}
            maxLength={LESSON_MAX}
            aria-label={t('note.editLabel')}
            onChange={(e) => setDraft(e.target.value)}
          />
          <DictateButton field={field} onText={setDraft} />
        </>
      ) : (
        <p>{note.text}</p>
      )}
      {note.why && !editing && <p className="text-body">{note.why}</p>}
      {failed && (
        <p role="alert" className="text-body">
          {t('note.failed')}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {editing ? (
          <>
            <Button size="sm" disabled={!draft.trim()} onClick={() => save(draft.trim(), true)}>
              {t('note.save')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
              {t('note.cancel')}
            </Button>
          </>
        ) : note.kind === 'add' || note.kind === 'update' ? (
          <>
            <Button size="sm" onClick={() => save(note.text, false)}>
              {t('note.keep')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setDraft(note.text)}>
              {t('note.edit')}
            </Button>
            <Button variant="ghost" size="sm" onClick={skip}>
              {t('note.skip')}
            </Button>
          </>
        ) : (
          <>
            {note.kind === 'none' && (
              <Button variant="outline" size="sm" onClick={() => save(note.text, true)}>
                {t('note.rememberIt')}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onDone}>
              {t('note.gotIt')}
            </Button>
          </>
        )}
      </div>
    </section>
  )
}

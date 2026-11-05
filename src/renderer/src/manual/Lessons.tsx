// What the person taught Pip by correcting answers (DECISIONS §15), newest first. The meter and the
// "not used" marks come from recentLessons, the same function that fills the prompt.
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Trash2 } from 'lucide-react'
import { LESSON_BUDGET_CHARS, recentLessons, type Lesson, type NoteMerge } from '@shared/schemas'
import { api } from '@renderer/api'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'

/** From here Pip offers to merge notes, before older ones start going unused. */
const OFFER_MERGE_PERCENT = 80

export function Lessons({
  lessons,
  failed,
  reload
}: {
  /** Null until loaded. */
  lessons: Lesson[] | null
  failed: boolean
  reload: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const heading = useRef<HTMLHeadingElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [merges, setMerges] = useState<NoteMerge[] | null>(null)
  const [working, setWorking] = useState(false)

  const list = lessons ?? []
  const used = new Set(recentLessons(list).map((l) => l.id))
  const chars = list.reduce((sum, l) => sum + l.text.length, 0)
  const percent = Math.min(100, Math.round((chars / LESSON_BUDGET_CHARS) * 100))
  const unused = list.length - used.size
  // A note deleted since Pip proposed the merge takes the merge with it.
  const open = merges?.filter((m) => m.ids.every((id) => list.some((l) => l.id === id))) ?? []

  const remove = (id: string): void => {
    setError(null)
    api.deleteLesson(id).then(
      () => {
        reload()
        heading.current?.focus()
      },
      () => setError('deleteFailed')
    )
  }
  const askMerges = (): void => {
    setError(null)
    setWorking(true)
    api
      .proposeMerges()
      .then(setMerges, () => setError('mergeFailed'))
      .finally(() => setWorking(false))
  }
  const drop = (merge: NoteMerge): void =>
    // Back to null with none left, so "found none" only ever follows an empty answer.
    setMerges((all) => {
      const rest = all?.filter((m) => m !== merge) ?? []
      return rest.length ? rest : null
    })
  const keep = (merge: NoteMerge): void => {
    setError(null)
    api.applyMerge(merge).then(
      () => {
        drop(merge)
        reload()
      },
      () => setError('saveFailed')
    )
  }

  return (
    <Card id="lessons" className="scroll-mt-4 gap-3 overflow-hidden px-5 py-4 shadow-none">
      <h2
        id="lessons-h"
        ref={heading}
        tabIndex={-1}
        className="text-[1.0625rem] font-bold outline-none"
      >
        {t('manual.lessons.title')}
      </h2>
      <p className="text-sm text-body">{t('manual.lessons.body')}</p>
      {(failed || error) && (
        <p role="alert" className="text-sm font-bold text-primary">
          {t(`manual.lessons.${failed ? 'loadFailed' : error}`)}
        </p>
      )}
      {lessons && list.length === 0 && <p className="font-bold">{t('manual.lessons.empty')}</p>}

      {list.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm">{t('manual.lessons.meter', { percent })}</p>
          <div aria-hidden className="h-1.5 rounded-full bg-border">
            <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
          </div>
          {unused > 0 && (
            <p className="text-sm text-body">{t('manual.lessons.full', { count: unused })}</p>
          )}
        </div>
      )}

      {percent >= OFFER_MERGE_PERCENT && list.length > 1 && merges === null && (
        <div className="flex flex-col items-start gap-1">
          <Button
            variant="outline"
            className="min-h-10 px-4 font-bold"
            disabled={working}
            onClick={askMerges}
          >
            {t(working ? 'manual.lessons.merging' : 'manual.lessons.merge')}
          </Button>
          <p className="text-sm text-muted-foreground">{t('manual.lessons.mergeNote')}</p>
        </div>
      )}
      {merges?.length === 0 && <p role="status">{t('manual.lessons.mergeNone')}</p>}
      {open.map((merge) => (
        <section
          key={merge.ids.join()}
          className="flex flex-col gap-2 rounded-lg bg-secondary/60 p-3 text-sm"
        >
          <h3 className="font-bold">{t('manual.lessons.mergeTitle')}</h3>
          <ul className="flex list-disc flex-col gap-1 pl-4 text-body">
            {merge.ids.map((id) => (
              <li key={id}>{list.find((l) => l.id === id)?.text}</li>
            ))}
          </ul>
          <p>
            <strong>{t('manual.lessons.becomes')}</strong> {merge.text}
          </p>
          <p className="text-body">{merge.why}</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => keep(merge)}>
              {t('manual.lessons.keep')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => drop(merge)}>
              {t('manual.lessons.skip')}
            </Button>
          </div>
        </section>
      ))}

      {list.length > 0 && (
        <ul>
          {[...list].reverse().map((l) => (
            <li key={l.id} className="flex items-start gap-2 border-t py-3">
              <div className="min-w-0 flex-1">
                <p className="break-words">{l.text}</p>
                {!used.has(l.id) && (
                  <p className="text-sm text-muted-foreground">{t('manual.lessons.unused')}</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-11 shrink-0"
                aria-label={t('manual.lessons.deleteOne', { what: l.text })}
                onClick={() => remove(l.id)}
              >
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

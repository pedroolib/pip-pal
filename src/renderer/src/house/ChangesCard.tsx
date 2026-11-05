// "Changes Pip helped with": the announced changes Pip decoded and helped plan for, newest first.
// Hidden when the read fails; an empty list says what will appear here.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRightLeft, FolderKanban, ListOrdered, UserRound } from 'lucide-react'
import type { ChangeEvent } from '@shared/schemas'
import { api } from '@renderer/api'
import { Button } from '@renderer/components/ui/button'
import { dayLabel, newestFirst } from './days'
import { HouseCard } from './parts'
import { useLoad } from './useLoad'

const ICONS = {
  none: ArrowRightLeft,
  project: FolderKanban,
  leader: UserRound,
  priorities: ListOrdered,
  other: ArrowRightLeft
} satisfies Record<ChangeEvent['type'], unknown>

const SHOWN = 3

export function ChangesCard(): React.JSX.Element | null {
  const { t, i18n } = useTranslation()
  const { data, failed } = useLoad(() => api.listChanges(), { onFocus: true })
  const [all, setAll] = useState(false)
  if (failed || data === null) return null
  const changes = newestFirst(data.filter((c) => c.type !== 'none'))
  const shown = all ? changes : changes.slice(0, SHOWN)

  return (
    <HouseCard aria-labelledby="home-changes">
      <h2 id="home-changes" className="text-[0.8125rem] font-bold text-muted-foreground">
        {t('house.changes.title')}
      </h2>
      {changes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('house.changes.empty')}</p>
      ) : (
        <ol className="motion-stagger relative flex flex-col">
          {shown.map((c, i) => {
            const Icon = ICONS[c.type]
            return (
              <li key={c.at + c.summary} className="relative flex gap-3.5 pb-4 last:pb-0">
                {/* A thin line joins the changes into a timeline. */}
                {i < shown.length - 1 && (
                  <span
                    aria-hidden
                    className="absolute top-10 bottom-1 left-[1.125rem] w-px bg-border"
                  />
                )}
                <span className="relative grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
                  <Icon className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="flex flex-wrap items-baseline gap-x-2 text-[0.8125rem]">
                    <span className="font-bold text-primary first-letter:uppercase">
                      {t('house.changes.kind', { type: t(`decode.changeTypes.${c.type}`) })}
                    </span>
                    <span className="text-muted-foreground first-letter:uppercase">
                      {dayLabel(c.at, i18n.language)}
                    </span>
                  </p>
                  <p className="mt-0.5 leading-snug">{c.summary}</p>
                </div>
              </li>
            )
          })}
        </ol>
      )}
      {!all && changes.length > SHOWN && (
        <Button
          variant="ghost"
          size="sm"
          className="w-fit text-primary"
          onClick={() => setAll(true)}
        >
          {t('house.changes.more', { count: changes.length - SHOWN })}
        </Button>
      )}
    </HouseCard>
  )
}

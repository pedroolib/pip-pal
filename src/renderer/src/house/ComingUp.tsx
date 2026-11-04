// "Coming up": the reminders, soonest first. Hidden when there are none or the read failed.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pencil, Trash2 } from 'lucide-react'
import { api } from '@renderer/api'
import { Button } from '@renderer/components/ui/button'
import { oldestFirst } from '@renderer/command/dueQueue'
import { ReminderForm } from '@renderer/command/ReminderForm'
import { formatDue } from '@renderer/triage/model'
import { HouseCard } from './parts'
import { useLoad } from './useLoad'

const SHOWN = 3
const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

export function ComingUp(): React.JSX.Element | null {
  const { t, i18n } = useTranslation()
  const { data, reload } = useLoad(() => api.listReminders(), { onFocus: true })
  const [editing, setEditing] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [all, setAll] = useState(false)

  if (!data?.length) return null
  const sorted = [...data].sort((a, b) => oldestFirst(a, b) || a.id.localeCompare(b.id))
  const shown = all ? sorted : sorted.slice(0, SHOWN)
  const now = new Date()

  return (
    <HouseCard aria-labelledby="home-coming">
      <div>
        <h2 id="home-coming" className="text-[1.0625rem] leading-snug font-bold">
          {t('comingUp.title')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('comingUp.sub')}</p>
      </div>
      <ul className="flex flex-col">
        {shown.map((r) => (
          <li key={r.id} className="border-t py-3 first:border-t-0 first:pt-0">
            {editing === r.id ? (
              <ReminderForm
                inline
                initial={r}
                onSaved={() => (setEditing(null), reload())}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <div className="min-w-0 flex-[1_1_15rem]">
                  <p className="line-clamp-2 leading-snug font-bold break-words">{r.text}</p>
                  <p className="text-sm text-body">
                    {capital(
                      formatDue({ text: '', date: r.at, explicit: true }, now, i18n.language).date
                    )}
                  </p>
                </div>
                {deleting === r.id ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg bg-secondary/60 p-3">
                    <p role="alert" className="text-sm font-bold">
                      {t('comingUp.deleteCheck')}
                    </p>
                    <Button
                      size="sm"
                      onClick={() =>
                        void api
                          .deleteReminder(r.id)
                          .catch(() => {})
                          .finally(() => (setDeleting(null), reload()))
                      }
                    >
                      {t('comingUp.delete')}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setDeleting(null)}>
                      {t('comingUp.keep')}
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(r.id)}>
                      <Pencil aria-hidden />
                      {t('comingUp.edit')}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleting(r.id)}>
                      <Trash2 aria-hidden />
                      {t('comingUp.delete')}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {!all && sorted.length > SHOWN && (
        <Button variant="outline" className="w-fit" onClick={() => setAll(true)}>
          {t('comingUp.showMore', { count: sorted.length - SHOWN })}
        </Button>
      )}
    </HouseCard>
  )
}

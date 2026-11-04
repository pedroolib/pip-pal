// Pip's reminder: shows the step it was holding and why it matters. Nothing here needs an answer:
// if the person ignores it, main shows it again a few times, then parks it on Home.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Reminder, ReminderDelay } from '@shared/schemas'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Pip } from '@renderer/pip/Pip'
import { SnoozePicker } from './SnoozePicker'

export function ReminderCard({
  reminder,
  missed,
  onOpen,
  onDone,
  onAgain
}: {
  reminder: Reminder
  /** It came due while Pip was closed. */
  missed: boolean
  onOpen: () => void
  onDone: () => void
  onAgain: (delay: ReminderDelay) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [picking, setPicking] = useState(false)
  return (
    <Card className="min-h-0 w-full gap-4 overflow-y-auto p-5 shadow-lg" role="status">
      <div className="flex items-center gap-3">
        <Pip mood="gentle" size={44} />
        <p className="text-sm font-bold text-muted-foreground">
          {t(missed ? 'reminder.fromEarlier' : 'reminder.title')}
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="text-xl leading-tight font-bold">{reminder.title}</h1>
        {reminder.why && <p className="leading-relaxed text-body">{reminder.why}</p>}
      </div>
      {picking ? (
        <SnoozePicker onPick={onAgain} onCancel={() => setPicking(false)} />
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="lg" onClick={onOpen}>
            {t('reminder.open')}
          </Button>
          <Button size="lg" variant="outline" onClick={() => setPicking(true)}>
            {t('reminder.again')}
          </Button>
          <Button size="lg" variant="ghost" onClick={onDone}>
            {t('reminder.done')}
          </Button>
        </div>
      )}
    </Card>
  )
}

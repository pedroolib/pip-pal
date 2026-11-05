// A reminder whose time has come. It never takes the keyboard or focus, so it cannot interrupt typing;
// the buttons are plain mouse targets. The caller does the saving (onDone / onLater).
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Check, Clock, Info } from 'lucide-react'
import type { Reminder } from '@shared/schemas'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Pip } from '@renderer/pip/Pip'
import { CARD_WIDTH, formatDue } from '@renderer/triage/model'
import { quickAt, type QuickTime } from './times'

const QUICK: [QuickTime, string][] = [
  ['in15', 'reminder.in15'],
  ['in1h', 'reminder.in1h'],
  ['tomorrow9', 'reminder.tomorrow9']
]

export function ReminderDueCard({
  reminder,
  canGoBack,
  more,
  onDone,
  onLater,
  onBack
}: {
  reminder: Reminder
  /** The step this reminder came from is still open. */
  canGoBack: boolean
  /** Due reminders waiting behind this one. */
  more: number
  onDone: () => void | Promise<void>
  /** The new moment as an ISO string, counted from the press. */
  onLater: (at: string) => void | Promise<void>
  onBack: () => void
}): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const [choosing, setChoosing] = useState(false)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)

  const run = async (go: () => void | Promise<void>): Promise<void> => {
    setBusy(true)
    setFailed(false)
    try {
      await go()
    } catch {
      setFailed(true)
      setBusy(false)
    }
  }
  const setFor = formatDue(
    { text: '', date: reminder.at, explicit: true },
    new Date(),
    i18n.language
  ).date

  return (
    <Card
      className="min-h-0 gap-4 overflow-y-auto p-5 shadow-float"
      style={{ width: CARD_WIDTH, maxWidth: '100%' }}
    >
      <div className="flex items-center gap-3">
        <Pip mood="calm" size={44} />
        <div className="min-w-0">
          <h1 className="font-bold">{t('due.title')}</h1>
          <p className="text-sm text-body">{t('due.setFor', { time: setFor })}</p>
        </div>
      </div>
      <p className="text-lg leading-snug font-bold break-words whitespace-pre-wrap">
        {reminder.text}
      </p>
      {failed && (
        <p role="alert" className="flex items-start gap-2 text-sm text-body">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
          {t('due.failed')}
        </p>
      )}
      {choosing ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-bold">{t('due.again')}</p>
          {QUICK.map(([kind, key]) => (
            <Button
              key={kind}
              variant="outline"
              size="lg"
              disabled={busy}
              className="justify-start"
              onClick={() => void run(() => onLater(quickAt(kind, new Date()).toISOString()))}
            >
              <Clock aria-hidden />
              {t(key)}
            </Button>
          ))}
          <Button variant="ghost" className="self-start" onClick={() => setChoosing(false)}>
            <ArrowLeft aria-hidden />
            {t('due.back')}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Button size="lg" disabled={busy} onClick={() => void run(onDone)}>
            <Check aria-hidden />
            {t('due.done')}
          </Button>
          <Button variant="outline" size="lg" disabled={busy} onClick={() => setChoosing(true)}>
            <Clock aria-hidden />
            {t('due.later')}
          </Button>
          {canGoBack && (
            <Button variant="ghost" className="self-start text-primary" onClick={onBack}>
              {t('due.backToStep')}
            </Button>
          )}
        </div>
      )}
      {more > 0 && (
        <p className="text-sm text-muted-foreground">{t('due.more', { count: more })}</p>
      )}
    </Card>
  )
}

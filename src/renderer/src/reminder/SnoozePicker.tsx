// "When should I remind you?": the five times Pip offers wherever it says "Not now".
import { useTranslation } from 'react-i18next'
import { REMINDER_DELAYS, type ReminderDelay } from '@shared/schemas'
import { Button } from '@renderer/components/ui/button'

export function SnoozePicker({
  onPick,
  onCancel
}: {
  onPick: (delay: ReminderDelay) => void
  onCancel?: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div role="group" aria-label={t('reminder.when')} className="flex flex-col gap-2">
      <p className="text-sm font-bold">{t('reminder.when')}</p>
      <div className="flex flex-wrap gap-2">
        {REMINDER_DELAYS.map((d) => (
          <Button key={d} variant="outline" size="sm" onClick={() => onPick(d)}>
            {t(`reminder.delay.${d}`)}
          </Button>
        ))}
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {t('reminder.cancel')}
          </Button>
        )}
      </div>
    </div>
  )
}

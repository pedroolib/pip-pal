// Energy check-in (faces, inspired by spoon theory): 1–5, tap once to answer. Gentle, skippable, never scolding.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LOW_SPOONS, type ReminderDelay } from '@shared/schemas'
import { SnoozePicker } from '@renderer/reminder/SnoozePicker'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Pip } from '@renderer/pip/Pip'
import { Face } from './Face'
import { slotFor } from './model'

export function CheckInCard({
  onAnswer,
  onSnooze
}: {
  onAnswer: (spoons: number) => void
  /** "Not now" with the time the person picked. */
  onSnooze: (delay: ReminderDelay) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [picked, setPicked] = useState<number | null>(null)
  const [picking, setPicking] = useState(false)

  if (picked !== null) {
    const low = picked <= LOW_SPOONS
    return (
      <Card className="@container min-h-0 w-full justify-center overflow-y-auto gap-4 p-5 shadow-lg">
        <div className="flex flex-col items-center gap-3 text-center">
          <Pip mood={low ? 'gentle' : 'happy'} className="h-auto w-1/3 min-w-16" />
          <p className="text-[clamp(1.125rem,5cqw,1.75rem)] leading-snug font-bold" role="status">
            {low ? t('checkIn.low') : t('checkIn.thanks')}
          </p>
        </div>
        <Button size="lg" onClick={() => onAnswer(picked)}>
          {t('checkIn.continue')}
        </Button>
      </Card>
    )
  }

  // The afternoon check-in closes the day, so Pip winds down; earlier ones stay gentle.
  const winding = slotFor(new Date()) === 'afternoon'
  return (
    <Card className="min-h-0 w-full overflow-y-auto gap-4 p-5 shadow-lg">
      <div className="flex items-center gap-3">
        <Pip mood={winding ? 'sleepy' : 'gentle'} size={44} />
        <div>
          <h1 className="font-bold">{t('checkIn.title')}</h1>
          <p className="text-sm text-body">{t('checkIn.hint')}</p>
        </div>
      </div>
      <div role="group" aria-label={t('checkIn.title')} className="grid grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <div key={n} className="flex flex-col items-center gap-1">
            <button
              type="button"
              aria-label={t('checkIn.spoons', { count: n })}
              onClick={() => setPicked(n)}
              className="w-full rounded-2xl p-1 transition-transform hover:scale-105 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <Face level={n} className="h-auto w-full" />
            </button>
            <span aria-hidden className="text-sm font-bold">
              {n}
            </span>
          </div>
        ))}
      </div>
      {picking ? (
        <SnoozePicker onPick={onSnooze} onCancel={() => setPicking(false)} />
      ) : (
        <Button variant="ghost" className="self-start text-primary" onClick={() => setPicking(true)}>
          {t('checkIn.notNow')}
        </Button>
      )}
    </Card>
  )
}

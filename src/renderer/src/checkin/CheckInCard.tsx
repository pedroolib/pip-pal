// Spoons check-in: 1–5, tap once to answer. Gentle, skippable, never scolding.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LOW_SPOONS } from '@shared/schemas'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Pip } from '@renderer/pip/Pip'
import { slotFor } from './model'

function Spoon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 32" className="-ml-1 h-6 w-3 first:ml-0" aria-hidden>
      <ellipse cx={8} cy={8} rx={6} ry={7} fill="var(--primary)" />
      <rect x={6.75} y={14} width={2.5} height={16} rx={1.25} fill="var(--primary)" />
    </svg>
  )
}

export function CheckInCard({
  onAnswer,
  onSnooze
}: {
  onAnswer: (spoons: number) => void
  onSnooze: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [picked, setPicked] = useState<number | null>(null)

  if (picked !== null) {
    const low = picked <= LOW_SPOONS
    return (
      <Card className="min-h-0 w-full overflow-y-auto gap-3 p-5 shadow-lg">
        <div className="flex items-center gap-3">
          <Pip mood={low ? 'gentle' : 'happy'} size={44} />
          <p className="font-bold" role="status">
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
          <Button
            key={n}
            variant="outline"
            aria-label={t('checkIn.spoons', { count: n })}
            onClick={() => setPicked(n)}
            className="h-auto flex-col gap-1 px-1 py-2"
          >
            <span className="flex h-6 items-end">
              {Array.from({ length: n }, (_, i) => (
                <Spoon key={i} />
              ))}
            </span>
            <span className="text-sm font-bold">{n}</span>
          </Button>
        ))}
      </div>
      <Button variant="ghost" className="self-start text-primary" onClick={onSnooze}>
        {t('checkIn.notNow')}
      </Button>
    </Card>
  )
}

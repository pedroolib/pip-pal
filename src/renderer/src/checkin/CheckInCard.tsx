// Energy check-in (faces, inspired by spoon theory): 1–5, tap once to answer. Gentle, skippable, never scolding.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LOW_SPOONS } from '@shared/schemas'
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
  onSnooze: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [picked, setPicked] = useState<number | null>(null)
  // The energy level being pointed at or focused: the face by the title shows it.
  const [looking, setLooking] = useState<number | null>(null)

  if (picked !== null) {
    const low = picked <= LOW_SPOONS
    return (
      <Card className="@container min-h-0 w-full justify-center overflow-y-auto gap-4 p-5 shadow-lg">
        <div className="flex flex-col items-center gap-3 text-center">
          <Pip mood={low ? 'gentle' : 'happy'} className="h-auto w-20" />
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
    <Card className="min-h-0 w-full justify-between overflow-y-auto gap-4 p-5 shadow-lg">
      <div className="flex items-center gap-4">
        <span className="grid size-14 shrink-0 place-items-center">
          {looking ? (
            <Face level={looking} size={56} />
          ) : (
            <Pip mood={winding ? 'sleepy' : 'gentle'} size={56} />
          )}
        </span>
        <h1 className="text-lg leading-snug font-bold">{t('checkIn.title')}</h1>
      </div>
      <div role="group" aria-label={t('checkIn.title')} className="grid grid-cols-5 gap-3">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={t('checkIn.spoons', { count: n })}
            onClick={() => setPicked(n)}
            onMouseEnter={() => setLooking(n)}
            onMouseLeave={() => setLooking(null)}
            onFocus={() => setLooking(n)}
            onBlur={() => setLooking(null)}
            className="flex flex-col items-center gap-1.5 rounded-2xl border bg-white/60 px-2 pt-3 pb-2 transition-colors hover:border-primary hover:bg-secondary focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <Face level={n} className="h-auto w-full max-w-16" />
            <span aria-hidden className="text-sm font-bold">
              {n}
            </span>
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-body">{t('checkIn.hint')}</p>
        <Button variant="ghost" className="shrink-0 text-primary" onClick={onSnooze}>
          {t('checkIn.notNow')}
        </Button>
      </div>
    </Card>
  )
}

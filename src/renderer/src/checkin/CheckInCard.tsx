// Spoons check-in: 1–5, tap once to answer. Gentle, skippable, never scolding.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LOW_SPOONS } from '@shared/schemas'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Pip, type Mood } from '@renderer/pip/Pip'

// Each answer is Pip's face for that much energy, from worn out to full of beans.
const FACES: Record<number, Mood> = {
  1: 'sleepy',
  2: 'quiet',
  3: 'calm',
  4: 'happy',
  5: 'celebrate'
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

  return (
    <Card className="min-h-0 w-full overflow-y-auto gap-4 p-5 shadow-lg">
      <div className="flex items-center gap-3">
        <Pip mood="gentle" size={44} />
        <div className="min-w-0 break-words">
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
            className="h-auto min-w-0 flex-col gap-1 overflow-hidden px-1 py-2"
          >
            {/* Sized by its wrapper so it shrinks with the button (Button forces size-4 on bare svgs). */}
            <span className="flex h-10 w-full min-w-0 justify-center">
              <Pip mood={FACES[n]} className="size-full" />
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

// After a mid-task mood answer of 1-3: the ways to settle from the person's manual, or straight back to the steps.
// 4-5 never get here: the card just goes on.
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Timer } from 'lucide-react'
import type { CalmingStrategy } from '@shared/schemas'
import { api } from '@renderer/api'
import { CalmingCard } from '@renderer/calm/CalmingCard'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Pip } from '@renderer/pip/Pip'
import { moodLevel } from './model'

/** Strategies shown at once: the card keeps the size of the others. */
const SHOWN = 3

export function MoodOptions({
  spoons,
  waiting,
  onContinue,
  onKeepAll
}: {
  spoons: number
  /** Steps a low answer just moved to "can wait" (0 when none, or once the person got them back). */
  waiting: number
  onContinue: () => void
  onKeepAll: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const low = moodLevel(spoons) === 'low'
  const [strategies, setStrategies] = useState<CalmingStrategy[]>([])
  const [picked, setPicked] = useState<CalmingStrategy | null>(null)
  useEffect(() => {
    // No profile only means no strategies to list: the way back to the steps stays.
    api.getProfile().then(
      (p) => setStrategies(p.calmingStrategies.slice(0, SHOWN)),
      () => {}
    )
  }, [])

  if (picked)
    return <CalmingCard strategy={picked} then={t('mood.then')} onDone={onContinue} />

  return (
    <Card className="min-h-0 w-full gap-4 overflow-y-auto p-5 shadow-float">
      <div className="flex items-start gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-pip-soft">
          <Pip mood={low ? 'gentle' : 'calm'} size={34} />
        </span>
        <h1 className="pt-1 leading-snug font-bold" role="status">
          {t(low ? 'mood.low' : 'mood.mid')}
        </h1>
      </div>
      {strategies.length > 0 && (
        <div className="flex flex-col gap-2">
          {strategies.map((s, i) => (
            <Button
              key={s.id ?? s.label}
              size="lg"
              variant={low && i === 0 ? 'default' : 'outline'}
              className="justify-start"
              onClick={() => setPicked(s)}
            >
              <Timer aria-hidden />
              {t('mood.strategy', { label: s.label, minutes: s.minutes })}
            </Button>
          ))}
        </div>
      )}
      <Button
        size="lg"
        variant={low && strategies.length > 0 ? 'outline' : 'default'}
        onClick={onContinue}
      >
        {t('checkIn.continue')}
      </Button>
      {low && waiting > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-body">
          <p>{t('mood.trimmed', { count: waiting })}</p>
          <Button variant="ghost" size="sm" onClick={onKeepAll}>
            {t('mood.keepAll')}
          </Button>
        </div>
      )}
    </Card>
  )
}

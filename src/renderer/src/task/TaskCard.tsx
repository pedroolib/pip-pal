// The task card: one step at a time, like the reference in docs/design/task-card-reference.png.
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Clock, Minus } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { segments } from '@renderer/decode/model'
import { Pip, type Mood } from '@renderer/pip/Pip'
import { cn } from '@renderer/lib/utils'

type Step = { text: string; why: string | null }

// Pip smiles for a moment after each step, then settles. Keyed by step, so each step starts fresh.
function StepPip({ finished, cheer }: { finished: boolean; cheer: boolean }): React.JSX.Element {
  const [happy, setHappy] = useState(cheer)
  useEffect(() => {
    const id = setTimeout(() => setHappy(false), 2000)
    return () => clearTimeout(id)
  }, [])
  const mood: Mood = finished ? 'celebrate' : happy ? 'happy' : 'calm'
  return <Pip mood={mood} size={40} />
}

export function TaskCard({
  title,
  steps,
  laterCount,
  current,
  due,
  onDone,
  onStuck,
  onMinimize
}: {
  title: string
  /** The steps for now (already trimmed by spoons). */
  steps: Step[]
  /** Steps that can wait, shown once these are finished. */
  laterCount: number
  /** Index of the step in progress; equal to steps.length when all are done. */
  current: number
  due: string | null
  onDone: () => void
  onStuck: () => void
  onMinimize: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const finished = current >= steps.length
  const step = steps[current]
  const next = steps[current + 1]

  return (
    <Card className="@container min-h-0 w-full overflow-y-auto gap-4 p-5 shadow-lg">
      <header className="flex items-center gap-3">
        <StepPip key={current} finished={finished} cheer={current > 0} />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 leading-snug font-bold">{title}</p>
          {!finished && (
            <p className="text-sm text-muted-foreground">
              {t('card.stepOf', { current: current + 1, total: steps.length })}
            </p>
          )}
        </div>
        <Button variant="ghost" size="icon-sm" aria-label={t('card.minimize')} onClick={onMinimize}>
          <Minus aria-hidden />
        </Button>
      </header>

      <div className="flex gap-1.5" aria-hidden>
        {segments(steps.length, current).map((s, i) => (
          <span
            key={i}
            className={cn(
              'h-1.5 flex-1 rounded-full',
              s === 'done' && 'bg-primary',
              s === 'current' && 'bg-primary/40',
              s === 'todo' && 'bg-border'
            )}
          />
        ))}
      </div>

      {/* Wide window: the step on the left, its buttons on the right. */}
      <div className="flex flex-col gap-4 @xl:flex-row @xl:items-end @xl:gap-8">
        {finished ? (
          <div className="flex flex-col gap-1 @xl:flex-1">
            <h1 className="text-2xl font-bold">{t('card.allDone')}</h1>
            <p className="text-body">
              {laterCount > 0
                ? t('card.restWaiting', { count: laterCount })
                : t('card.allDoneBody')}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1 @xl:flex-1" aria-live="polite">
            <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
              {t('card.now')}
            </p>
            <h1 className="text-2xl leading-tight font-bold">{step.text}</h1>
            {step.why && <p className="text-body">{step.why}</p>}
          </div>
        )}

        {finished ? (
          <Button size="lg" className="@xl:w-48" onClick={onMinimize}>
            {t('card.close')}
          </Button>
        ) : (
          <div className="flex gap-2 @xl:w-48 @xl:flex-col">
            <Button size="lg" className="flex-1" onClick={onDone}>
              {t('card.done')}
            </Button>
            <Button size="lg" variant="outline" className="flex-1" onClick={onStuck}>
              {t('card.stuck')}
            </Button>
          </div>
        )}
      </div>

      {!finished && (next || due) && (
        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
          {next && <p className="line-clamp-1">{t('card.then', { step: next.text })}</p>}
          {due && (
            <p className="flex items-center gap-2">
              <Clock className="size-4 text-primary" aria-hidden />
              {due}
            </p>
          )}
        </div>
      )}
    </Card>
  )
}

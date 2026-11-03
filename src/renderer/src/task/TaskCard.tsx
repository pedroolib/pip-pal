// The task card: one step at a time, like the reference in docs/design/task-card-reference.png.
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ArrowRight, Clock, Minus } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { segments } from '@renderer/decode/model'
import { PeekingPip } from '@renderer/pip/PeekingPip'
import { Pip, type Mood } from '@renderer/pip/Pip'
import { cn } from '@renderer/lib/utils'
import { WithKeys } from './KeyCaps'

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
  onLater,
  onBack,
  onMinimize,
  children
}: {
  title: string
  /** The steps for now (already trimmed by spoons). */
  steps: Step[]
  /** Steps that can wait, shown once these are finished. */
  laterCount: number
  /** Index of the step in progress; equal to steps.length when all are done. */
  current: number
  /** "due Fri, Nov 6", shown after the step count. */
  due: string | null
  onDone: () => void
  onStuck: () => void
  /** "Not now": tuck the card away and bring it back once, a little later. */
  onLater?: () => void
  /** Back to the other options, when there are any. */
  onBack?: () => void
  onMinimize: () => void
  /** Shown at the bottom, e.g. which parts of the manual Pip used. */
  children?: React.ReactNode
}): React.JSX.Element {
  const { t } = useTranslation()
  const finished = current >= steps.length
  const step = steps[current]
  const next = steps[current + 1]
  const progress = finished ? null : t('card.stepOf', { current: current + 1, total: steps.length })

  return (
    <PeekingPip pip={<StepPip key={current} finished={finished} cheer={current > 0} />}>
      <Card className="@container min-h-0 w-full gap-4 overflow-y-auto p-5 shadow-lg">
        <header className="flex items-start gap-2">
          {onBack && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="-ml-2"
              aria-label={t('expand.back')}
              onClick={onBack}
            >
              <ArrowLeft aria-hidden />
            </Button>
          )}
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 leading-snug font-bold">{title}</p>
            {(progress || due) && (
              <p className="text-sm text-muted-foreground">
                {[progress, due].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="-mr-2"
            aria-label={t('card.minimize')}
            onClick={onMinimize}
          >
            <Minus aria-hidden />
          </Button>
        </header>

        <div className="flex gap-1.5" aria-hidden>
          {segments(steps.length, current).map((s, i) => (
            <span
              key={i}
              className={cn(
                'h-1.5 flex-1 rounded-full transition-colors duration-500',
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
            <div className="motion-swap flex flex-col gap-1 @xl:flex-1">
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
              {/* Keyed by step so each new step fades in. */}
              <div key={current} className="motion-swap flex flex-col gap-1">
                <h1 className="text-2xl leading-tight font-bold">
                  <WithKeys text={step.text} />
                </h1>
                {step.why && (
                  <p className="leading-relaxed text-body">
                    <WithKeys text={step.why} />
                  </p>
                )}
              </div>
            </div>
          )}

          {finished ? (
            <Button size="lg" className="@xl:w-48" onClick={onMinimize}>
              {t('card.close')}
            </Button>
          ) : (
            <div className="flex gap-2 @xl:shrink-0">
              <Button size="lg" className="flex-1 @xl:flex-none @xl:px-8" onClick={onDone}>
                {t('card.done')}
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="flex-1 @xl:flex-none"
                onClick={onStuck}
              >
                {t('card.stuck')}
              </Button>
              {onLater && (
                <Button
                  size="icon-lg"
                  variant="outline"
                  aria-label={t('card.later')}
                  title={t('card.later')}
                  onClick={onLater}
                >
                  <Clock aria-hidden />
                </Button>
              )}
            </div>
          )}
        </div>

        {!finished && next && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <ArrowRight className="size-4 shrink-0" aria-hidden />
            <span className="line-clamp-1">{t('card.then', { step: next.text })}</span>
          </p>
        )}
        {children}
      </Card>
    </PeekingPip>
  )
}

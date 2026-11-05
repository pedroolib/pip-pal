// The task card: one step at a time, like the reference in docs/design/task-card-reference.png.
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ArrowRight, Clock, MessageSquarePlus, Minus } from 'lucide-react'
import { CORRECTION_MAX } from '@shared/ipc'
import { api } from '@renderer/api'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Textarea } from '@renderer/components/ui/textarea'
import { DictateButton } from '@renderer/record/DictateButton'
import { segments } from '@renderer/decode/model'
import { PeekingPip } from '@renderer/pip/PeekingPip'
import { Pip, type Mood } from '@renderer/pip/Pip'
import { cn } from '@renderer/lib/utils'
import { WithKeys } from './KeyCaps'

type Step = { text: string; why: string | null }

// "That's not right": the person tells Pip what it was missing and gets new steps. The overlay
// is never focused, so it takes the keyboard while the field is open.
// Closed until clicked, even when Pip asks (`ask`): the answer arrives while the person may be typing elsewhere.
export function Correct({
  onSend,
  ask = false
}: {
  onSend: (text: string) => void
  ask?: boolean
}): React.JSX.Element {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const field = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (!open) return
    api.setOverlayFocus(true)
    return () => api.setOverlayFocus(false)
  }, [open])
  if (!open)
    return (
      <Button
        variant={ask ? 'default' : 'ghost'}
        size="sm"
        className="self-start"
        onClick={() => setOpen(true)}
      >
        <MessageSquarePlus aria-hidden />
        {t(ask ? 'card.correct.answer' : 'card.correct.open')}
      </Button>
    )
  return (
    <div className="flex flex-col gap-2">
      <Textarea
        ref={field}
        autoFocus
        value={text}
        maxLength={CORRECTION_MAX}
        aria-label={t('card.correct.label')}
        placeholder={t('card.correct.placeholder')}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex gap-2">
        <Button size="sm" disabled={!text.trim()} onClick={() => onSend(text.trim())}>
          {t(ask ? 'card.correct.sendAsk' : 'card.correct.send')}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          {t('card.correct.cancel')}
        </Button>
        <DictateButton field={field} onText={setText} />
      </div>
    </div>
  )
}

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
  onCorrect,
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
  /** The clock: open the reminder form for this step. */
  onLater?: () => void
  /** "That's not right": new steps from what the person typed. */
  onCorrect?: (text: string) => void
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
      <Card className="@container min-h-0 w-full gap-4 overflow-y-auto p-5 shadow-float">
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
                'h-1 flex-1 rounded-full transition-colors duration-500',
                s === 'done' && 'bg-primary',
                s === 'current' && 'bg-primary/40',
                s === 'todo' && 'bg-input'
              )}
            />
          ))}
        </div>

        {/* Wide window: the step on the left, its buttons on the right. */}
        <div className="flex flex-col gap-4 @xl:flex-row @xl:items-end @xl:gap-8">
          {finished ? (
            <div className="motion-swap flex flex-col gap-1 @xl:flex-1">
              <h1 className="text-[1.375rem] font-bold">{t('card.allDone')}</h1>
              <p className="text-body">
                {laterCount > 0
                  ? t('card.restWaiting', { count: laterCount })
                  : t('card.allDoneBody')}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1 @xl:flex-1" aria-live="polite">
              {/* Keyed by step so each new step fades in. */}
              <div key={current} className="motion-swap flex flex-col gap-1">
                <h1 className="text-[1.375rem] leading-tight font-bold">
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
        {onCorrect && <Correct onSend={onCorrect} />}
        {children}
      </Card>
    </PeekingPip>
  )
}

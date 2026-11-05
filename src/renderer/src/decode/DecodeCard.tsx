// The card Pip shows after decoding a selected message (demo script 0:20–1:05). Every suggestion
// shows its why, and Pip never sends anything: the drafted question is only copied.
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BookOpen, Calendar, Check, ChevronDown, Copy, HelpCircle } from 'lucide-react'
import type { Decoded } from '@shared/schemas'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@renderer/components/ui/collapsible'
import { Pip } from '@renderer/pip/Pip'
import { planSteps, showAsk } from './model'

function Section({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex min-h-10 w-full items-center gap-2 rounded-md text-left text-sm font-bold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
        <ChevronDown
          className="size-4 shrink-0 transition-transform duration-150 group-data-[state=closed]:-rotate-90"
          aria-hidden
        />
        {title}
      </CollapsibleTrigger>
      <CollapsibleContent className="pb-2 pl-6 text-sm">{children}</CollapsibleContent>
    </Collapsible>
  )
}

export function StepNumber({ n }: { n: number }): React.JSX.Element {
  return (
    <span
      aria-hidden
      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-bold"
    >
      {n}
    </span>
  )
}

export function CopyQuestion({
  text,
  onCopied
}: {
  text: string
  onCopied?: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const id = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(id)
  }, [copied])
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() =>
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true)
          onCopied?.()
        })
      }
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      <span aria-live="polite">{copied ? t('decode.ask.copied') : t('decode.ask.copy')}</span>
    </Button>
  )
}

export function DecodeCard({
  decoded,
  spoons,
  onStart,
  onLater
}: {
  decoded: Decoded
  /** Latest check-in today, or null. With few spoons only the first steps show. */
  spoons: number | null
  onStart?: () => void
  onLater?: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const { classification: c, decode: d } = decoded
  const { now, later } = planSteps(d.steps, spoons)
  const tone = t(`decode.tones.${c.tone}`)
  const toneLabel =
    c.tone === 'urgent'
      ? t('decode.tone', { tone })
      : t(c.urgency >= 4 ? 'decode.toneUrgent' : 'decode.toneNotUrgent', { tone })
  const changeType = d.change?.type ?? c.changeType

  return (
    <Card className="@container min-h-0 w-full gap-0 py-0 shadow-float">
      {/* Wide window: what's asked and the steps on the left, questions and context on the right. */}
      <div
        data-fit-scroll
        className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto p-5 @2xl:grid-cols-2 @2xl:gap-x-8"
      >
        <div className="flex flex-col gap-4">
          <header className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-muted-foreground">{t('decode.eyebrow')}</p>
              <h1 className="text-lg leading-snug font-bold">{d.summary}</h1>
            </div>
            <Pip mood="reading" size={44} />
          </header>

          <div className="flex flex-wrap gap-1.5">
            {changeType !== 'none' && (
              <Badge variant="secondary">
                {t('decode.change', { type: t(`decode.changeTypes.${changeType}`) })}
              </Badge>
            )}
            <Badge variant="outline">{toneLabel}</Badge>
          </div>

          {d.deadline && (
            <p className="flex items-center gap-2 text-sm">
              <Calendar className="size-4 text-primary" aria-hidden />
              {d.deadline.text}
              {!d.deadline.explicit && (
                <span className="text-muted-foreground">{t('decode.inferred')}</span>
              )}
            </p>
          )}

          {decoded.fromCache && (
            <p className="text-xs text-muted-foreground">{t('decode.fromCache')}</p>
          )}

          <section aria-label={t('decode.stepsTitle')}>
            <ol className="flex flex-col gap-3">
              {now.map((s, i) => (
                <li key={i} className="flex gap-3">
                  <StepNumber n={i + 1} />
                  <div className="pt-0.5">
                    <p>{s.text}</p>
                    {s.why && <p className="text-sm text-body">{s.why}</p>}
                  </div>
                </li>
              ))}
            </ol>
            {later.length > 0 && (
              <Section title={t('decode.canWait', { count: later.length })}>
                <ol className="flex flex-col gap-2 text-body" start={now.length + 1}>
                  {later.map((s, i) => (
                    <li key={i}>{s.text}</li>
                  ))}
                </ol>
              </Section>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-4">
          {showAsk(c, d.uncertainties) &&
            d.uncertainties.map((u, i) => (
              <section key={i} className="flex flex-col gap-2 rounded-lg bg-secondary/60 p-3">
                <h2 className="flex items-center gap-2 text-sm font-bold">
                  <HelpCircle className="size-4 text-primary" aria-hidden />
                  {t('decode.ask.title')}
                </h2>
                <p className="text-sm text-body">{u.what}</p>
                <blockquote className="rounded-md border bg-card p-2 text-sm">
                  {u.suggestedQuestion}
                </blockquote>
                <div>
                  <CopyQuestion text={u.suggestedQuestion} />
                </div>
              </section>
            ))}

          <div>
            {d.implicitExpectations.length > 0 && (
              <Section title={t('decode.expected')}>
                <ul className="flex flex-col gap-2">
                  {d.implicitExpectations.map((e, i) => (
                    <li key={i}>
                      <p>{e.expectation}</p>
                      <p className="text-body">{e.why}</p>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
            {d.change && (
              <Section title={t('decode.changePlan')}>
                <ul className="flex list-disc flex-col gap-1 pl-4">
                  {d.change.transitionPlan.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
                {d.change.questionsToAsk.length > 0 && (
                  <>
                    <p className="pt-2 font-bold">{t('decode.questions')}</p>
                    <ul className="flex list-disc flex-col gap-1 pl-4">
                      {d.change.questionsToAsk.map((q, i) => (
                        <li key={i}>{q}</li>
                      ))}
                    </ul>
                  </>
                )}
              </Section>
            )}
          </div>

          {d.profileUsed.length > 0 && (
            <section className="flex flex-col gap-1 border-t pt-3 text-sm">
              <h2 className="flex items-center gap-2 font-bold">
                <BookOpen className="size-4 text-primary" aria-hidden />
                {t('decode.usedManual')}
              </h2>
              <ul className="flex flex-col gap-1 text-body">
                {d.profileUsed.map((p, i) => (
                  <li key={i}>{p.how}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      <div className="flex gap-2 border-t p-4 @2xl:justify-end">
        <Button size="lg" className="flex-1 @2xl:flex-none" onClick={onStart}>
          {t('decode.start')}
        </Button>
        <Button size="lg" variant="outline" className="flex-1 @2xl:flex-none" onClick={onLater}>
          {t('decode.later')}
        </Button>
      </div>
    </Card>
  )
}

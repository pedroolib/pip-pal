// What a bubble button opens after its one Claude call: the steps one at a time, the questions to
// ask, or the plan for the change. Every suggestion shows its why, and Pip never sends anything:
// drafted questions are only copied.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BookOpen, HelpCircle, Minus, X } from 'lucide-react'
import type { ActionKind, CalmingStrategy, Expansion, Triage } from '@shared/schemas'
import { api } from '@renderer/api'
import { CalmingCard } from '@renderer/calm/CalmingCard'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { CopyQuestion, StepNumber } from '@renderer/decode/DecodeCard'
import { planSteps } from '@renderer/decode/model'
import { Pip, type Mood } from '@renderer/pip/Pip'
import { TaskCard } from '@renderer/task/TaskCard'
import { formatDue } from '@renderer/triage/model'

type ProfileUsed = Expansion['profileUsed']

function Shell({
  mood,
  title,
  onMinimize,
  onClose,
  children
}: {
  mood: Mood
  title: string
  onMinimize: () => void
  onClose: () => void
  children: React.ReactNode
}): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <Card className="min-h-0 w-full gap-4 overflow-y-auto p-5 shadow-lg">
      <header className="flex items-center gap-3">
        <Pip mood={mood} size={40} />
        <h1 className="min-w-0 flex-1 leading-snug font-bold">{title}</h1>
        <Button variant="ghost" size="icon-sm" aria-label={t('card.minimize')} onClick={onMinimize}>
          <Minus aria-hidden />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label={t('expand.close')} onClick={onClose}>
          <X aria-hidden />
        </Button>
      </header>
      {children}
    </Card>
  )
}

function UsedManual({ used }: { used: ProfileUsed }): React.JSX.Element | null {
  const { t } = useTranslation()
  if (used.length === 0) return null
  return (
    <section className="flex flex-col gap-1 border-t pt-3 text-sm">
      <h2 className="flex items-center gap-2 font-bold">
        <BookOpen className="size-4 text-primary" aria-hidden />
        {t('expand.usedManual')}
      </h2>
      <ul className="flex flex-col gap-1 text-body">
        {used.map((p, i) => (
          <li key={i}>{p.how}</li>
        ))}
      </ul>
    </section>
  )
}

function Questions({
  questions
}: {
  questions: Extract<Expansion, { kind: 'questions' }>['questions']
}): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-body">{t('expand.copyIntro')}</p>
      {questions.map((q, i) => (
        <section key={i} className="flex flex-col gap-2 rounded-lg bg-secondary/60 p-3">
          <p className="flex gap-2 text-sm text-body">
            <HelpCircle className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            {q.what}
          </p>
          <blockquote className="rounded-md border bg-card p-2 text-sm">
            {q.suggestedQuestion}
          </blockquote>
          <div>
            <CopyQuestion text={q.suggestedQuestion} />
          </div>
        </section>
      ))}
    </div>
  )
}

function Plan({
  plan,
  questionsToAsk
}: Omit<Extract<Expansion, { kind: 'transition' }>, 'kind' | 'profileUsed'>): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-3">
        {plan.map((p, i) => (
          <li key={i} className="flex gap-3">
            <StepNumber n={i + 1} />
            <p className="pt-0.5">{p}</p>
          </li>
        ))}
      </ol>
      {questionsToAsk.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-bold">{t('expand.questionsToAsk')}</h2>
          {questionsToAsk.map((q, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-lg bg-secondary/60 p-3">
              <p className="text-sm">{q}</p>
              <div>
                <CopyQuestion text={q} />
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

export function ExpandView({
  kind,
  expansion,
  error,
  spoons,
  step,
  deadline,
  onStepDone,
  onAsk,
  onMinimize,
  onClose
}: {
  kind: ActionKind
  /** null while Claude works on it. */
  expansion: Expansion | null
  error: boolean
  /** Latest check-in today, or null. With few spoons only the first steps show. */
  spoons: number | null
  /** Index of the step in progress (steps only). */
  step: number
  /** The bubble's deadline, shown under the steps. */
  deadline: Triage['deadline']
  onStepDone: () => void
  /** "I'm stuck" with no calming strategy in the manual: ask what's unclear instead. */
  onAsk: () => void
  /** Tuck the card away: Pip stays floating and reopens it on click. */
  onMinimize: () => void
  /** Finished with it: Pip hides until the hotkey. */
  onClose: () => void
}): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const [calm, setCalm] = useState<CalmingStrategy | null>(null)
  const title = t(`bubble.actions.${kind}`)

  if (error || !expansion) {
    return (
      <Shell
        mood={error ? 'gentle' : 'thinking'}
        title={title}
        onMinimize={onMinimize}
        onClose={onClose}
      >
        <p role="status" className="text-body">
          {t(error ? 'expand.error' : 'expand.working')}
        </p>
      </Shell>
    )
  }

  if (expansion.kind === 'steps') {
    if (calm)
      return <CalmingCard strategy={calm} then={t('calm.thisStep')} onDone={() => setCalm(null)} />
    const { now, later } = planSteps(expansion.steps, spoons)
    const when = deadline && formatDue(deadline, new Date(), i18n.language)
    const stuck = (): void => {
      api.getProfile().then((p) => {
        const strategy = p.calmingStrategies[0]
        if (strategy) setCalm(strategy)
        else onAsk()
      }, onAsk)
    }
    return (
      <TaskCard
        title={t('expand.stepsTitle')}
        steps={now}
        laterCount={later.length}
        current={step}
        due={when ? t(when.key, { date: when.date }) : null}
        onDone={onStepDone}
        onStuck={stuck}
        // When every step is done the card's only button is Close.
        onMinimize={step >= now.length ? onClose : onMinimize}
      />
    )
  }

  return (
    <Shell mood="showing" title={title} onMinimize={onMinimize} onClose={onClose}>
      {expansion.kind === 'questions' ? (
        <Questions questions={expansion.questions} />
      ) : (
        <Plan plan={expansion.plan} questionsToAsk={expansion.questionsToAsk} />
      )}
      <UsedManual used={expansion.profileUsed} />
    </Shell>
  )
}

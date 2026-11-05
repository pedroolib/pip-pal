// What a bubble button opens after its one Claude call: the steps one at a time, the questions to
// ask, or the plan for the change. Every suggestion shows its why, and Pip never sends anything:
// drafted questions are only copied. The calming offer lives with the task in the overlay, so
// tucking the card away doesn't offer it twice.
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronRight,
  HelpCircle,
  Lightbulb,
  Minus,
  RotateCcw,
  X
} from 'lucide-react'
import type {
  ActionKind,
  CalmingStrategy,
  Expansion,
  NoteProposal,
  QuestionTopic,
  Triage
} from '@shared/schemas'
import { CalmingCard } from '@renderer/calm/CalmingCard'
import { CheckInCard } from '@renderer/checkin/CheckInCard'
import { MoodOptions } from '@renderer/mood/MoodOptions'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@renderer/components/ui/collapsible'
import { CopyQuestion, StepNumber } from '@renderer/decode/DecodeCard'
import { RememberNote } from '@renderer/expand/RememberNote'
import { planSteps } from '@renderer/decode/model'
import { PeekingPip } from '@renderer/pip/PeekingPip'
import { Pip, type Mood } from '@renderer/pip/Pip'
import { WithKeys } from '@renderer/task/KeyCaps'
import { Correct, TaskCard } from '@renderer/task/TaskCard'
import { formatDue } from '@renderer/triage/model'

type CopiedHandler = (what: string, question: string, topic: QuestionTopic) => void

// The bubble says "Due Fri, Nov 6"; the card puts it after the step count, in lower case.
const DUE_KEY = { 'bubble.due': 'card.due', 'bubble.before': 'card.before' } as const

/** "I'm stuck" on a step: its text, what the person answered so far, and where Pip's call is. */
export type Stuck = {
  step: string
  answer: string
  status: 'working' | 'error' | 'asking'
  /** Pip's question when it needs context first ('asking'), else empty. */
  question: string
}

/** Back to the bubble's other buttons; the card's call keeps going. */
function BackButton({ onBack }: { onBack: () => void }): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="-ml-2"
      aria-label={t('expand.back')}
      onClick={onBack}
    >
      <ArrowLeft aria-hidden />
    </Button>
  )
}

function Shell({
  mood,
  title,
  onBack,
  onMinimize,
  onClose,
  children
}: {
  mood: Mood
  title: string
  onBack?: () => void
  onMinimize: () => void
  onClose: () => void
  children: React.ReactNode
}): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <PeekingPip pip={<Pip mood={mood} size={40} />}>
      <Card className="min-h-0 w-full gap-4 overflow-y-auto p-5 shadow-float">
        <header className="flex items-center gap-1">
          {onBack && <BackButton onBack={onBack} />}
          <h1 className="min-w-0 flex-1 leading-snug font-bold">{title}</h1>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('card.minimize')}
            onClick={onMinimize}
          >
            <Minus aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="-mr-2"
            aria-label={t('expand.close')}
            onClick={onClose}
          >
            <X aria-hidden />
          </Button>
        </header>
        {children}
      </Card>
    </PeekingPip>
  )
}

/** Soft lines where the answer will be, so the card doesn't jump when it arrives. */
function Placeholder(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      {['w-11/12', 'w-3/4', 'w-5/6'].map((w, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="skeleton size-6 shrink-0 rounded-full" />
          <span className={`skeleton h-3 rounded-full ${w}`} />
        </div>
      ))}
    </div>
  )
}

// Closed at first and with no animation: this much text at once overstimulates (DECISIONS §4).
function Used({
  label,
  Icon,
  items
}: {
  label: string
  Icon: typeof BookOpen
  items: string[]
}): React.JSX.Element | null {
  if (items.length === 0) return null
  return (
    <Collapsible className="flex flex-col gap-1 border-t pt-2 text-sm">
      <h2>
        <CollapsibleTrigger className="group flex min-h-8 w-full items-center gap-2 rounded-sm text-left font-bold focus-visible:outline-3 focus-visible:outline-solid">
          <ChevronRight
            className="size-4 shrink-0 text-primary group-data-[state=open]:rotate-90"
            aria-hidden
          />
          <Icon className="size-4 shrink-0 text-primary" aria-hidden />
          {label}
        </CollapsibleTrigger>
      </h2>
      <CollapsibleContent>
        <ul className="flex flex-col gap-1 text-body">
          {items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}

/** What shaped this answer: the person's manual and what they taught Pip. */
function UsedBy({ expansion }: { expansion: Expansion }): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <>
      <Used
        label={t('expand.usedManual')}
        Icon={BookOpen}
        items={expansion.profileUsed.map((p) => p.how)}
      />
      <Used label={t('expand.usedLessons')} Icon={Lightbulb} items={expansion.lessonsUsed} />
    </>
  )
}

function Questions({
  questions,
  onCopied
}: {
  questions: Extract<Expansion, { kind: 'questions' }>['questions']
  onCopied: CopiedHandler
}): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="motion-stagger flex flex-col gap-3">
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
            <CopyQuestion
              text={q.suggestedQuestion}
              onCopied={() => onCopied(q.what, q.suggestedQuestion, q.topic)}
            />
          </div>
        </section>
      ))}
    </div>
  )
}

function Plan({
  plan,
  questionsToAsk,
  planned,
  onCopied,
  onPlanned
}: Omit<Extract<Expansion, { kind: 'transition' }>, 'kind' | 'profileUsed' | 'lessonsUsed'> & {
  planned: boolean
  onCopied: CopiedHandler
  onPlanned: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-4">
      <ol className="motion-stagger flex flex-col gap-3">
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
                {/* The plan's questions carry no topic in the contract. */}
                <CopyQuestion text={q} onCopied={() => onCopied(q, q, 'other')} />
              </div>
            </div>
          ))}
        </section>
      )}
      {planned ? (
        <p role="status" className="flex items-center gap-2 text-sm font-bold text-primary">
          <Check className="size-4" aria-hidden />
          {t('expand.planned')}
        </p>
      ) : (
        <Button size="lg" onClick={onPlanned}>
          {t('expand.gotPlan')}
        </Button>
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
  calm,
  stuck,
  planned,
  asked,
  mood,
  cut,
  onCalm,
  onMood,
  onMoodDone,
  onKeepAll,
  onStepDone,
  onLater,
  onCorrect,
  note,
  onNoteDone,
  onStuck,
  onStuckCancel,
  onCopied,
  onPlanned,
  onBack,
  onRetry,
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
  /** A calming strategy offered before going on (low spoons or a change). */
  calm: CalmingStrategy | null
  /** Pip is breaking the current step down, or null (steps only). */
  stuck: Stuck | null
  /** The person said they have a plan for the change (transition only). */
  planned: boolean
  /** A drafted question was copied: Pip says thanks. */
  asked: boolean
  /** Mid-task: 'ask' shows "How are you feeling?", a number is the face just picked, null is nothing (steps only). */
  mood: 'ask' | number | null
  /** How many steps stay visible after a low mood, or null for the usual plan (steps only). */
  cut: number | null
  /** Offer a strategy, or null when the person skipped it or is ready. */
  onCalm: (strategy: CalmingStrategy | null) => void
  /** The face picked, or null for "Not now". */
  onMood: (spoons: number | null) => void
  /** Back to the steps after the options. */
  onMoodDone: () => void
  /** Bring back the steps a low mood moved to "can wait". */
  onKeepAll: () => void
  onStepDone: () => void
  /** The clock on the steps card: open the reminder form for the current step. */
  onLater: () => void
  /** "Tell Pip more context" on the steps card: ask again with what the person added. */
  onCorrect: (text: string) => void
  /** What Pip proposes to remember from a correction, or null. */
  note: NoteProposal | null
  /** The person answered the proposal, so it goes away. */
  onNoteDone: () => void
  /** "I'm stuck": break the current step down; also retries, and sends the answer when Pip asked for context. */
  onStuck: (answer?: string) => void
  /** Back to the step as it was. */
  onStuckCancel: () => void
  /** A drafted question was copied: the person is asking instead of guessing. */
  onCopied: CopiedHandler
  onPlanned: () => void
  /** Back to the bubble's other buttons, when there is a bubble. */
  onBack?: () => void
  /** Ask Claude again after an error. */
  onRetry: () => void
  /** Tuck the card away: Pip stays floating and reopens it on click. */
  onMinimize: () => void
  /** Finished with it: Pip hides until the hotkey. */
  onClose: () => void
}): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const title = t(`bubble.actions.${kind}`)

  if (error || !expansion) {
    return (
      <Shell
        mood={error ? 'gentle' : 'thinking'}
        title={title}
        onBack={onBack}
        onMinimize={onMinimize}
        onClose={onClose}
      >
        <p role="status" className="text-body">
          {t(error ? 'expand.error' : 'expand.working')}
        </p>
        {error ? (
          <Button variant="outline" className="self-start" onClick={onRetry}>
            <RotateCcw aria-hidden />
            {t('expand.retry')}
          </Button>
        ) : (
          <Placeholder />
        )}
      </Shell>
    )
  }

  if (calm) {
    const then =
      expansion.kind === 'transition'
        ? t('calm.thePlan')
        : t(step === 0 ? 'calm.step1' : 'calm.thisStep')
    return <CalmingCard strategy={calm} then={then} onDone={() => onCalm(null)} />
  }

  // Every few finished steps Pip asks how the person feels, then offers ways to settle or to go on.
  if (expansion.kind === 'steps' && mood !== null) {
    if (mood === 'ask')
      return (
        <CheckInCard
          instant
          title={t('mood.title')}
          onAnswer={onMood}
          onSnooze={() => onMood(null)}
        />
      )
    const all = planSteps(expansion.steps, spoons).now.length
    return (
      <MoodOptions
        spoons={mood}
        waiting={all - planSteps(expansion.steps, spoons, cut).now.length}
        onContinue={onMoodDone}
        onKeepAll={onKeepAll}
      />
    )
  }

  // The steps hinge on something Pip can't know: it asks instead of guessing.
  if (expansion.kind === 'steps' && expansion.needsContext) {
    return (
      <Shell
        mood="thinking"
        title={title}
        onBack={onBack}
        onMinimize={onMinimize}
        onClose={onClose}
      >
        <p className="text-sm text-body">{t('expand.needsContext')}</p>
        <p className="font-bold">{expansion.needsContext}</p>
        <Correct ask onSend={onCorrect} />
      </Shell>
    )
  }

  if (expansion.kind === 'steps' && stuck) {
    return (
      <Shell
        mood={stuck.status === 'error' ? 'gentle' : 'thinking'}
        title={t('expand.stuck.title')}
        onMinimize={onMinimize}
        onClose={onClose}
      >
        <p className="rounded-lg bg-secondary/60 p-3 text-sm">
          <WithKeys text={stuck.step} />
        </p>
        {stuck.status === 'asking' ? (
          <>
            <p className="text-sm text-body">{t('expand.stuck.needsContext')}</p>
            <p className="font-bold">{stuck.question}</p>
            <Correct ask onSend={onStuck} />
          </>
        ) : (
          <>
            <p role="status" className="text-body">
              {t(stuck.status === 'error' ? 'expand.error' : 'expand.stuck.working')}
            </p>
            {stuck.status === 'error' ? (
              <Button variant="outline" className="self-start" onClick={() => onStuck()}>
                <RotateCcw aria-hidden />
                {t('expand.retry')}
              </Button>
            ) : (
              <Placeholder />
            )}
          </>
        )}
        <Button variant="ghost" size="sm" className="self-start" onClick={onStuckCancel}>
          <ArrowLeft aria-hidden />
          {t('expand.stuck.back')}
        </Button>
      </Shell>
    )
  }

  if (expansion.kind === 'steps') {
    const { now, later } = planSteps(expansion.steps, spoons, cut)
    const when = deadline && formatDue(deadline, new Date(), i18n.language)
    return (
      <TaskCard
        title={t('expand.stepsTitle')}
        steps={now}
        laterCount={later.length}
        current={step}
        due={when ? t(DUE_KEY[when.key], { date: when.date }) : null}
        onDone={onStepDone}
        onStuck={() => onStuck()}
        onLater={onLater}
        onCorrect={onCorrect}
        onBack={onBack}
        // When every step is done the card's only button is Close.
        onMinimize={step >= now.length ? onClose : onMinimize}
      >
        {note && <RememberNote key={note.text} note={note} onDone={onNoteDone} />}
        <UsedBy expansion={expansion} />
      </TaskCard>
    )
  }

  return (
    <Shell
      mood={planned ? 'happy' : asked ? 'thanks' : 'showing'}
      title={title}
      onBack={onBack}
      onMinimize={onMinimize}
      onClose={onClose}
    >
      {expansion.kind === 'questions' ? (
        <Questions questions={expansion.questions} onCopied={onCopied} />
      ) : (
        <Plan
          plan={expansion.plan}
          questionsToAsk={expansion.questionsToAsk}
          planned={planned}
          onCopied={onCopied}
          onPlanned={onPlanned}
        />
      )}
      <UsedBy expansion={expansion} />
    </Shell>
  )
}

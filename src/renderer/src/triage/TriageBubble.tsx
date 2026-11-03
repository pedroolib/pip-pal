// The triage bubble Pip shows next to the cursor: facts on top, then one button per offered action.
// The buttons do nothing yet. Model text is only ever rendered as plain text.
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Calendar,
  CircleHelp,
  Clock,
  Frown,
  ListChecks,
  Meh,
  MessageSquare,
  Route,
  Smile,
  Users,
  type LucideIcon
} from 'lucide-react'
import type { ActionKind, Triage, TriageTone } from '@shared/schemas'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@renderer/components/ui/tooltip'
import { cn } from '@renderer/lib/utils'
import { Pip } from '@renderer/pip/Pip'
import { CARD_WIDTH, PIP_SIZE, triageLines, type Flip } from './model'

const TONE_ICON: Record<TriageTone, LucideIcon> = {
  friendly: Smile,
  neutral: Meh,
  worried: Frown,
  upset: Frown
}
const ACTION_ICON: Record<ActionKind, LucideIcon> = {
  transition: Route,
  steps: ListChecks,
  questions: CircleHelp
}

const FOCUS = 'rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'
const DOTTED =
  'underline decoration-dotted decoration-[1.5px] underline-offset-4 decoration-muted-foreground'

function Tip({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <TooltipContent side="top" align="start" collisionPadding={8}>
      {children}
    </TooltipContent>
  )
}

function Fact({
  icon: Icon,
  children
}: {
  icon: LucideIcon
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <li className="flex items-start gap-3 text-base leading-6">
      <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  )
}

/** The bold label of a fact; with evidence it gets a dotted underline and a tooltip on hover and focus. */
function Label({
  evidence,
  children
}: {
  evidence?: string
  children: React.ReactNode
}): React.JSX.Element {
  if (!evidence) return <b>{children}</b>
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <b tabIndex={0} className={cn(FOCUS, DOTTED)}>
          {children}
        </b>
      </TooltipTrigger>
      <Tip>{evidence}</Tip>
    </Tooltip>
  )
}

/** The tone and its quote, clamped to two lines; only when it is actually cut does it get the full quote in a tooltip. */
function ToneLine({ label, quote }: { label: string; quote?: string }): React.JSX.Element {
  const { t } = useTranslation()
  const ref = useRef<HTMLSpanElement>(null)
  const [clamped, setClamped] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = (): void => setClamped(el.scrollHeight > el.clientHeight)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [label, quote, clamped])
  const text = (
    <span
      ref={ref}
      tabIndex={clamped && quote ? 0 : undefined}
      className={cn('line-clamp-2 break-words', FOCUS)}
    >
      <b>{label}</b>
      {quote && <span className="font-normal text-body">{t('bubble.quote', { quote })}</span>}
    </span>
  )
  // Wrapping remounts the span, which is why the effect above depends on `clamped`.
  if (!clamped || !quote) return text
  return (
    <Tooltip>
      <TooltipTrigger asChild>{text}</TooltipTrigger>
      <Tip>{quote}</Tip>
    </Tooltip>
  )
}

function ActionButton({
  kind,
  maybe,
  eyebrow,
  about,
  onClick
}: {
  kind: ActionKind
  maybe: boolean
  eyebrow?: string
  about?: string | null
  onClick?: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const Icon = ACTION_ICON[kind]
  const single = !eyebrow && !about
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      className={cn(
        'h-auto min-h-11 w-full items-start justify-start gap-3 rounded-md border bg-white px-3 py-2 text-left whitespace-normal shadow-xs hover:bg-accent',
        single && 'items-center',
        maybe &&
          'border-dashed border-muted-foreground/70 bg-transparent font-normal shadow-none hover:bg-accent/60'
      )}
    >
      <Icon className={cn('size-5 shrink-0 text-primary', !single && 'mt-0.5')} aria-hidden />
      <span className="flex min-w-0 flex-col">
        {eyebrow && (
          <span className="text-xs font-bold tracking-wide text-body uppercase">{eyebrow}</span>
        )}
        <span className={cn('text-base', !maybe && 'font-bold')}>
          {t(`bubble.actions.${kind}`)}
        </span>
        {about && <span className="text-sm font-normal text-muted-foreground">{about}</span>}
      </span>
    </Button>
  )
}

export function TriageBubble({
  triage,
  error,
  flip = { x: false, y: false },
  onAction
}: {
  /** null while Jev reads: Pip alone. */
  triage: Triage | null
  error: boolean
  /** Pip stays at the cursor's corner of the card: right of it when flipped on x, below when on y. */
  flip?: Flip
  /** A button was pressed: Pip makes the one Claude call for that kind. */
  onAction?: (kind: ActionKind) => void
}): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const lines = useMemo(
    () => (triage ? triageLines(triage, new Date(), i18n.language) : null),
    [triage, i18n.language]
  )

  return (
    <TooltipProvider disableHoverableContent>
      <div
        className={cn(
          'flex max-w-full gap-2',
          flip.x && 'flex-row-reverse',
          flip.y ? 'items-end' : 'items-start'
        )}
      >
        <Pip
          mood={triage || error ? 'calm' : 'reading'}
          size={PIP_SIZE}
          className={flip.y ? 'mb-3' : 'mt-3'}
        />
        {error && (
          <Card role="status" style={{ width: CARD_WIDTH }} className="min-w-0 gap-0 p-5 shadow-lg">
            <p className="text-base">{t('bubble.error')}</p>
          </Card>
        )}
        {!triage && !error && (
          <span role="status" className="sr-only">
            {t('bubble.reading')}
          </span>
        )}
        {triage && lines && (
          <Card style={{ width: CARD_WIDTH }} className="min-w-0 gap-0 p-5 shadow-lg">
            {lines.from && (
              <p className="mb-2.5 text-sm text-muted-foreground">
                {t('bubble.from', { role: lines.from })}
              </p>
            )}
            <ul className="flex flex-col gap-2.5">
              <Fact icon={lines.when.icon === 'date' ? Calendar : Clock}>
                <div className="flex flex-wrap items-center gap-x-2">
                  <Label evidence={lines.when.evidence}>
                    {t(lines.when.key, lines.when.params)}
                  </Label>
                  {lines.when.mark && (
                    <span className="flex items-center gap-1 text-sm font-bold text-primary">
                      <CircleHelp className="size-4" aria-hidden />
                      {t('bubble.worthAsking')}
                    </span>
                  )}
                </div>
              </Fact>
              <Fact icon={MessageSquare}>
                <b>{t(lines.reply)}</b>
              </Fact>
              <Fact icon={TONE_ICON[lines.tone.tone]}>
                <ToneLine label={t(lines.tone.key)} quote={lines.tone.quote} />
              </Fact>
              {lines.addressee && (
                <Fact icon={Users}>
                  <b>{t(lines.addressee)}</b>
                </Fact>
              )}
            </ul>
            {lines.actions.length > 0 && (
              <>
                <hr className="my-3.5 border-border" />
                <div className="flex flex-col gap-2">
                  {lines.actions.map(({ kind, strength, eyebrow }) => (
                    <ActionButton
                      key={kind}
                      kind={kind}
                      maybe={strength === 'maybe'}
                      eyebrow={
                        eyebrow &&
                        t(eyebrow.key, eyebrow.typeKey ? { type: t(eyebrow.typeKey) } : undefined)
                      }
                      about={kind === 'questions' && lines.about ? t(lines.about) : null}
                      onClick={() => onAction?.(kind)}
                    />
                  ))}
                </div>
              </>
            )}
          </Card>
        )}
      </div>
    </TooltipProvider>
  )
}

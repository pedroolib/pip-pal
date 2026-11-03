// Voice capture next to Pip: pick a source, record (pill), write it down on this machine, then review
// the transcript and send the selection (or all of it) to the same triage as the text hotkey.
// Audio stays in memory and is dropped once transcribe settles; Pip never records by itself.
import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AudioLines,
  CircleHelp,
  Clock,
  Info,
  LoaderCircle,
  Mic,
  Monitor,
  Square,
  type LucideIcon
} from 'lucide-react'
import { RECORD_MAX_MS, type RecordSource } from '@shared/schemas'
import { api } from '@renderer/api'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Label } from '@renderer/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@renderer/components/ui/radio-group'
import { Textarea } from '@renderer/components/ui/textarea'
import { cn } from '@renderer/lib/utils'
import { Pip, type Mood } from '@renderer/pip/Pip'
import { CARD_WIDTH, PIP_SIZE, type Flip } from '@renderer/triage/model'
import { MAX_READ, failureOf, formatElapsed, ownsEnter, toRead } from './model'
import { CantHearError, startRecording, type Recording } from './recorder'

type Phase =
  | 'source'
  | 'starting'
  | 'recording'
  | 'transcribing'
  | 'review'
  | 'empty'
  | 'error'
  | 'noModel'
  | 'cantHear'

const SOURCES: { value: RecordSource; icon: LucideIcon }[] = [
  { value: 'mic', icon: Mic },
  { value: 'system', icon: Monitor },
  { value: 'both', icon: AudioLines }
]

const MOOD: Record<Phase, Mood> = {
  source: 'calm',
  starting: 'calm',
  recording: 'listening',
  transcribing: 'thinking',
  review: 'reading',
  empty: 'gentle',
  error: 'gentle',
  noModel: 'gentle',
  cantHear: 'gentle'
}

const MAC = /Mac/.test(navigator.userAgent)

/** A key cap on a button, like KeyCaps; light on the primary button. */
function Kbd({ children, light }: { children: string; light?: boolean }): React.JSX.Element {
  return (
    <kbd
      className={cn(
        'rounded-md border bg-card px-1.5 py-0.5 font-sans text-[0.85em] font-bold shadow-[0_1px_0_var(--border)]',
        light && 'border-white/45 bg-white/20 text-white shadow-none'
      )}
    >
      {children}
    </kbd>
  )
}

function Note({ icon: Icon, children }: { icon: LucideIcon; children: string }): React.JSX.Element {
  return (
    <p className="flex items-start gap-2 text-sm leading-5 text-body">
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      {children}
    </p>
  )
}

export function RecordFlow({
  flip,
  onRead,
  onClose
}: {
  flip: Flip
  /** "Read this with Pip": the text goes to the overlay's capture(). */
  onRead: (text: string) => void
  onClose: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const titleId = useId()
  const [phase, setPhase] = useState<Phase>('source')
  const [source, setSource] = useState<RecordSource>('mic')
  // The source of the last recording, for "Try again".
  const [tried, setTried] = useState<RecordSource>('mic')
  const [started, setStarted] = useState(0)
  const [now, setNow] = useState(0)
  // The recording stopped itself at RECORD_MAX_MS.
  const [limited, setLimited] = useState(false)
  const [text, setText] = useState('')
  const [sel, setSel] = useState({ start: 0, end: 0 })
  const rec = useRef<Recording | null>(null)
  // Bumped whenever a recording is dropped, so a late start, silence check or transcript is ignored.
  const run = useRef(0)

  const drop = (): void => {
    run.current++
    rec.current?.cancel()
    rec.current = null
  }
  const close = (): void => {
    drop()
    onClose()
  }

  const start = (from: RecordSource): void => {
    const id = ++run.current
    setTried(from)
    setLimited(false)
    setPhase('starting')
    const cantHear = (): void => {
      if (id !== run.current) return
      drop()
      setPhase('cantHear')
    }
    startRecording(from, cantHear).then(
      (r) => {
        if (id !== run.current) return r.cancel()
        rec.current = r
        // Only a source that really started becomes the next preselection.
        api
          .getSettings()
          .then((s) => api.saveSettings({ ...s, recordSource: from }))
          .catch(() => {})
        setStarted(Date.now())
        setNow(Date.now())
        setPhase('recording')
      },
      (e) => id === run.current && setPhase(e instanceof CantHearError ? 'cantHear' : 'error')
    )
  }
  // Start on the source card.
  // Read through a ref so the key effect below does not re-register Esc on every radio click.
  const chosen = useRef(source)
  useEffect(() => {
    chosen.current = source
  }, [source])
  const begin = (): void => start(chosen.current)
  const stop = (auto = false): void => {
    const r = rec.current
    if (!r) return
    rec.current = null
    const id = run.current
    setLimited(auto)
    setPhase('transcribing')
    r.stop()
      .then((audio) => api.transcribe(audio))
      .then(
        (words) => {
          if (id !== run.current) return
          const heard = words.trim()
          setText(heard)
          setSel({ start: 0, end: 0 })
          setPhase(heard ? 'review' : 'empty')
        },
        (e) => id === run.current && setPhase(failureOf(e))
      )
  }

  // Preselect the last source used; Microphone the first time. A failed read keeps Microphone.
  useEffect(() => {
    api.getSettings().then(
      (s) => s.recordSource && setSource(s.recordSource),
      () => {}
    )
    return drop
  }, [])

  // The pill's clock, and the stop at RECORD_MAX_MS.
  useEffect(() => {
    if (phase !== 'recording') return
    const tick = setInterval(() => setNow(Date.now()), 250)
    const limit = setTimeout(() => stop(true), started + RECORD_MAX_MS - Date.now())
    return () => {
      clearInterval(tick)
      clearTimeout(limit)
    }
  }, [phase, started])

  // The record hotkey while this is open (the overlay only opens it): stop the recording, or start
  // over from a finished card. Review keeps its (maybe edited) transcript: only Esc or Close drop it.
  useEffect(
    () =>
      api.onRecordHotkey(() => {
        if (phase === 'recording') stop()
        else if (phase !== 'starting' && phase !== 'transcribing' && phase !== 'review')
          setPhase('source')
      }),
    [phase]
  )

  // While a card shows, or while writing down, Esc closes it (main grabs Esc only then, as for the
  // bubble); a late transcript is then ignored by `run`. Enter starts from the source card. During a
  // recording no key is taken from the app the person works in.
  const card = phase !== 'recording'
  useEffect(() => {
    if (!card) return
    api.setBubbleOpen(true)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
      if (e.key === 'Enter' && phase === 'source' && !ownsEnter(e.target)) {
        e.preventDefault()
        begin()
      }
    }
    const offDismiss = api.onDismiss(close)
    window.addEventListener('keydown', onKey)
    return () => {
      api.setBubbleOpen(false)
      offDismiss()
      window.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card, phase])

  // These two cards need the keyboard (Enter, typing); every other step gives it back.
  const typing = phase === 'source' || phase === 'review'
  const group = useRef<HTMLDivElement>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    api.setOverlayFocus(typing)
    if (typing) (phase === 'review' ? area : group).current?.focus()
  }, [typing, phase])
  useEffect(() => () => api.setOverlayFocus(false), [])

  const pill = phase === 'recording' || phase === 'transcribing'
  const reading = toRead(text, sel.start, sel.end)
  const over = reading.length > MAX_READ
  const part = sel.end > sel.start
  const select = (e: React.SyntheticEvent<HTMLTextAreaElement>): void =>
    setSel({ start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd })

  const title = (key: string, sub?: string, status?: boolean): React.JSX.Element => (
    <div>
      <h2 id={titleId} role={status ? 'status' : undefined} className="text-base font-bold">
        {t(key)}
      </h2>
      {sub && <p className="text-sm text-muted-foreground">{t(sub)}</p>}
    </div>
  )
  const closeButton = (grow?: boolean): React.JSX.Element => (
    <Button
      variant="outline"
      size="lg"
      className={cn(grow && 'flex-[1_1_8rem]')}
      aria-keyshortcuts="Escape"
      onClick={close}
    >
      {t('record.close')} <Kbd>Esc</Kbd>
    </Button>
  )
  const limitNote = limited && <Note icon={Clock}>{t('record.limit')}</Note>

  return (
    <div
      className={cn(
        'flex max-w-full gap-2',
        flip.x && 'flex-row-reverse',
        pill ? 'items-center' : flip.y ? 'items-end' : 'items-start'
      )}
    >
      <Pip mood={MOOD[phase]} size={PIP_SIZE} className={cn(!pill && (flip.y ? 'mb-3' : 'mt-3'))} />

      {(phase === 'source' || phase === 'starting') && (
        <Card
          style={{ width: CARD_WIDTH }}
          aria-labelledby={titleId}
          className="min-w-0 gap-4 p-5 shadow-lg"
        >
          {title('record.sourceTitle', 'record.sourceSub')}
          <RadioGroup
            ref={group}
            value={source}
            onValueChange={(v) => setSource(v as RecordSource)}
            aria-labelledby={titleId}
            disabled={phase === 'starting'}
            className="gap-2"
          >
            {SOURCES.map(({ value, icon: Icon }) => (
              <Label
                key={value}
                className="min-h-13 cursor-pointer gap-3 rounded-md border bg-white px-3 py-2 font-normal shadow-xs has-data-[state=checked]:border-primary has-data-[state=checked]:ring-1 has-data-[state=checked]:ring-primary"
              >
                <RadioGroupItem value={value} className="data-[state=checked]:border-primary" />
                <Icon className="size-5 shrink-0 text-primary" aria-hidden />
                <span className="flex min-w-0 flex-col">
                  <span className="text-base leading-6 font-bold">
                    {t(`record.sources.${value}.label`)}
                  </span>
                  <span className="text-sm leading-5 text-muted-foreground">
                    {t(`record.sources.${value}.sub`)}
                  </span>
                </span>
              </Label>
            ))}
          </RadioGroup>
          {/* Always takes its line, so the card keeps its height when the choice changes. */}
          <div className="min-h-5">
            {source !== 'mic' && <Note icon={Info}>{t('record.consent')}</Note>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="lg"
              className="flex-[1_1_8rem]"
              aria-keyshortcuts="Enter"
              disabled={phase === 'starting'}
              onClick={begin}
            >
              {t('record.start')} <Kbd light>Enter</Kbd>
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="flex-[1_1_8rem]"
              aria-keyshortcuts="Escape"
              onClick={close}
            >
              {t('record.cancel')} <Kbd>Esc</Kbd>
            </Button>
          </div>
        </Card>
      )}

      {pill && (
        <div className="flex min-w-0 flex-col gap-2">
          <div
            data-overlay-hit
            role={phase === 'recording' ? 'timer' : 'status'}
            className={cn(
              'flex min-h-12 min-w-0 items-center gap-3 self-start rounded-full border bg-white py-1 pl-4 shadow-lg motion-pop',
              phase === 'recording' ? 'pr-1' : 'pr-4'
            )}
          >
            {phase === 'recording' ? (
              <>
                {/* The halo only fades (no growth); reduced or calm motion leaves it still. */}
                <span
                  aria-hidden
                  className="relative size-2.5 shrink-0 rounded-full bg-primary after:absolute after:-inset-[5px] after:animate-pulse after:rounded-full after:bg-primary/20 after:[animation-duration:3s]"
                />
                <span className="text-base font-bold whitespace-nowrap tabular-nums">
                  {t('record.listening', { time: formatElapsed(now - started) })}
                </span>
                <Button
                  variant="outline"
                  size="lg"
                  className="rounded-full px-4"
                  aria-keyshortcuts="Control+Shift+Enter"
                  onClick={() => stop()}
                >
                  <Square className="fill-current" aria-hidden />
                  {t('record.stop')}
                </Button>
              </>
            ) : (
              <>
                <LoaderCircle
                  className="size-[18px] shrink-0 animate-spin text-primary"
                  aria-hidden
                />
                <span className="text-base">{t('record.transcribing')}</span>
              </>
            )}
          </div>
          {phase === 'transcribing' && limited && (
            <Card className="gap-0 px-4 py-3 shadow-lg">{limitNote}</Card>
          )}
        </div>
      )}

      {phase === 'review' && (
        <Card
          style={{ width: CARD_WIDTH }}
          aria-labelledby={titleId}
          className="min-w-0 gap-4 p-5 shadow-lg"
        >
          {title('record.reviewTitle', 'record.reviewSub')}
          {limitNote}
          <Textarea
            ref={area}
            value={text}
            aria-labelledby={titleId}
            onChange={(e) => {
              setText(e.target.value)
              select(e)
            }}
            onSelect={select}
            onKeyUp={select}
            onMouseUp={select}
            // Selecting text must not drag the overlay.
            onPointerDown={(e) => e.stopPropagation()}
            className="max-h-56 min-h-36 resize-none overflow-y-auto bg-white leading-6 select-text [field-sizing:fixed]"
          />
          <div className="-mt-2 flex items-start justify-between gap-3 text-sm leading-5">
            {over ? (
              <p role="status" className="flex flex-1 gap-2">
                <CircleHelp className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                {t('record.over')}
              </p>
            ) : (
              <p role="status" className="flex-1 text-muted-foreground">
                {t(part ? 'record.hintPart' : 'record.hintAll')}
              </p>
            )}
            <p
              className={cn(
                'whitespace-nowrap tabular-nums',
                over ? 'font-bold text-primary' : 'text-muted-foreground'
              )}
            >
              <span className="sr-only">{t('record.countLabel')} </span>
              {t('record.count', { n: reading.length, max: MAX_READ })}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="lg"
              className="flex-[1_1_8rem]"
              disabled={over || !reading.trim()}
              onClick={() => onRead(reading.trim())}
            >
              {t('record.read')}
            </Button>
            {closeButton()}
          </div>
        </Card>
      )}

      {(phase === 'empty' || phase === 'error' || phase === 'noModel') && (
        <Card
          style={{ width: CARD_WIDTH }}
          aria-labelledby={titleId}
          className="min-w-0 gap-4 p-5 shadow-lg"
        >
          <div>
            {title(phase === 'empty' ? 'record.emptyTitle' : 'record.errorTitle', undefined, true)}
            <p className="mt-1 text-base text-body">
              {t(
                phase === 'empty'
                  ? 'record.emptyBody'
                  : phase === 'noModel'
                    ? 'record.noModelBody'
                    : 'record.errorBody'
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="lg" className="flex-[1_1_8rem]" onClick={() => setPhase('source')}>
              {t('record.again')}
            </Button>
            {closeButton(true)}
          </div>
        </Card>
      )}

      {phase === 'cantHear' && (
        <Card
          style={{ width: CARD_WIDTH }}
          aria-labelledby={titleId}
          className="min-w-0 gap-4 p-5 shadow-lg"
        >
          <div>
            {title('record.cantHearTitle', undefined, true)}
            <p className="mt-1 text-base text-body">
              {t(MAC ? 'record.cantHearMac' : 'record.cantHearWindows')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="lg" className="flex-[1_1_8rem]" onClick={() => start(tried)}>
              {t('record.tryAgain')}
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="flex-[1_1_8rem]"
              onClick={() => start('mic')}
            >
              {t('record.micOnly')}
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}

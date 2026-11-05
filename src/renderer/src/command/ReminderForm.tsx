// The reminder form: what to remember and when. Used as an overlay card and, inline, inside the House.
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Check, Info } from 'lucide-react'
import { REMINDER_TEXT_MAX, hasVisibleText, type Reminder } from '@shared/schemas'
import { api } from '@renderer/api'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@renderer/components/ui/radio-group'
import { Textarea } from '@renderer/components/ui/textarea'
import { DictateButton } from '@renderer/record/DictateButton'
import { cn } from '@renderer/lib/utils'
import { CARD_WIDTH, type Flip } from '@renderer/triage/model'
import { MOOD } from './moods'
import { WithPip } from './WithPip'
import { errorFor, type FormError } from './formError'
import {
  customAt,
  dateField,
  describeWhen,
  quickAt,
  sameMoment,
  timeField,
  type QuickTime
} from './times'

const CHOICES = [
  ['in15', 'reminder.in15'],
  ['in1h', 'reminder.in1h'],
  ['tomorrow9', 'reminder.tomorrow9'],
  ['custom', 'reminder.custom']
] as const
type Choice = (typeof CHOICES)[number][0]

export function ReminderForm({
  initialText = '',
  initial,
  inline = false,
  flip,
  onSaved,
  onCancel
}: {
  initialText?: string
  initial?: Reminder
  inline?: boolean
  /** Overlay card only: which side of the cursor Pip stands on. */
  flip?: Flip
  onSaved: (reminder: Reminder) => void
  onCancel: () => void
}): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const start = initial ? new Date(initial.at) : null
  const [text, setText] = useState(initial?.text ?? initialText)
  // Editing starts on the custom time so the saved moment is shown exactly; a new one has none chosen.
  const [choice, setChoice] = useState<Choice | null>(initial ? 'custom' : null)
  const [date, setDate] = useState(start ? dateField(start) : '')
  const [time, setTime] = useState(start ? timeField(start) : '')
  const [error, setError] = useState<FormError | null>(null)
  const [saving, setSaving] = useState(false)
  const field = useRef<HTMLTextAreaElement>(null)

  // Overlay cards take the keyboard; the House already has it.
  useEffect(() => {
    if (inline) return
    api.setOverlayFocus(true)
    return () => api.setOverlayFocus(false)
  }, [inline])

  const when = (now: Date): Date | null =>
    choice === 'custom' ? customAt(date, time) : choice ? quickAt(choice as QuickTime, now) : null
  const now = new Date()
  const preview = when(now)
  // Fixing a word in a reminder that already fired keeps its time, past or not; main allows that.
  const keptAt =
    initial && choice === 'custom' && sameMoment(initial.at, date, time) ? initial.at : null
  const canSave =
    !saving && hasVisibleText(text) && (keptAt !== null || (preview !== null && preview > now))

  const save = async (): Promise<void> => {
    // Quick times count from the press, so a form left open cannot save a moment already gone.
    const at = when(new Date())
    if (!text.trim() || !at) return
    if (!keptAt && at <= new Date()) return setError('errorPast')
    const reminder: Reminder = {
      id: initial?.id ?? crypto.randomUUID(),
      text: text.trim(),
      at: keptAt ?? at.toISOString()
    }
    setError(null)
    setSaving(true)
    try {
      await api.saveReminder(reminder)
      onSaved(reminder)
    } catch (e) {
      setError(errorFor(e))
      setSaving(false)
    }
  }

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <h1 className={cn('font-bold', inline ? 'text-base' : 'text-lg')}>
          {t(initial ? 'reminder.titleEdit' : 'reminder.titleNew')}
        </h1>
        {!inline && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('reminder.close')}
            onClick={onCancel}
          >
            <ArrowLeft aria-hidden />
          </Button>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="reminder-text" className="font-bold">
          {t('reminder.textLabel')}
        </Label>
        <Textarea
          id="reminder-text"
          ref={field}
          autoFocus={!inline}
          value={text}
          maxLength={REMINDER_TEXT_MAX}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <DictateButton field={field} onText={setText} />
          {initialText && !initial && (
            <span className="text-sm text-body">{t('reminder.fromStep')}</span>
          )}
        </div>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-bold">{t('reminder.when')}</legend>
        <RadioGroup
          value={choice ?? ''}
          onValueChange={(v) => {
            setChoice(v as Choice)
            setError(null)
          }}
          aria-label={t('reminder.when')}
          className="grid-cols-2 gap-2"
        >
          {CHOICES.map(([value, key]) => (
            <Label
              key={value}
              className={cn(
                'min-h-10 min-w-0 cursor-pointer justify-center gap-1.5 rounded-md border bg-surface px-2 text-center text-sm whitespace-nowrap shadow-xs',
                'has-[:focus-visible]:border-ring has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50',
                choice === value &&
                  'border-primary bg-secondary font-bold shadow-[inset_0_0_0_1px_var(--primary)]'
              )}
            >
              <RadioGroupItem value={value} className="sr-only" />
              {choice === value && <Check aria-hidden className="size-4 shrink-0 text-primary" />}
              {t(key)}
            </Label>
          ))}
        </RadioGroup>
        {choice === 'custom' && (
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reminder-date">{t('reminder.date')}</Label>
              <Input
                id="reminder-date"
                type="date"
                value={date}
                onChange={(e) => (setDate(e.target.value), setError(null))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reminder-time">{t('reminder.time')}</Label>
              <Input
                id="reminder-time"
                type="time"
                value={time}
                onChange={(e) => (setTime(e.target.value), setError(null))}
              />
            </div>
          </div>
        )}
      </fieldset>
      <div role="status" className="flex flex-col gap-1.5 text-sm text-body">
        {preview && preview > now && (
          <p>{t('reminder.summary', { when: describeWhen(preview, now, i18n.language) })}</p>
        )}
        {initialText && !initial && <p>{t('reminder.tuckStep')}</p>}
      </div>
      {error && (
        <p role="alert" className="flex items-start gap-2 text-sm text-body">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
          {t(`reminder.${error}`)}
        </p>
      )}
      <div className="flex gap-2">
        <Button size="lg" disabled={!canSave} onClick={() => void save()}>
          {t(initial ? 'reminder.saveChanges' : 'reminder.save')}
        </Button>
        <Button variant="ghost" size="lg" onClick={onCancel}>
          {t('reminder.cancel')}
        </Button>
      </div>
    </>
  )

  if (inline) return <div className="flex max-w-md flex-col gap-4 py-1">{body}</div>
  return (
    <WithPip mood={saving ? 'thanks' : MOOD.remind} flip={flip}>
      <Card
        className="min-h-0 gap-4 overflow-y-auto p-5 shadow-float"
        style={{ width: CARD_WIDTH, maxWidth: '100%' }}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
      >
        {body}
      </Card>
    </WithPip>
  )
}

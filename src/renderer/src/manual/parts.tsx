import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ChevronDown, Info, Lock, Pencil, Plus, Trash2 } from 'lucide-react'
import { Recipient, type Origin } from '@shared/schemas'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Checkbox } from '@renderer/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Textarea } from '@renderer/components/ui/textarea'

export type Kind = 'entry' | 'strategy' | 'person'
export type Draft = {
  text: string
  minutes: string
  name: string
  role: string
  visibleTo: Recipient[]
}

const touch = 'min-h-11 min-w-11'

function Shared({ visibleTo }: { visibleTo: Recipient[] }): React.JSX.Element {
  const { t } = useTranslation()
  if (visibleTo.length === 0) {
    return (
      <Badge variant="outline" className="min-h-6 bg-muted text-sm">
        <Lock aria-hidden /> {t('manual.onlyYou')}
      </Badge>
    )
  }
  return (
    <>
      <span className="text-sm text-muted-foreground">{t('manual.sharedWith')}</span>
      {visibleTo.map((r) => (
        <Badge key={r} variant="secondary" className="min-h-6 text-sm">
          {t(`manual.recipients.${r}`)}
        </Badge>
      ))}
    </>
  )
}

function OriginBadge({ origin }: { origin: Origin }): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <Badge variant="outline" className="min-h-6 text-sm">
      {origin === 'pip' && <span aria-hidden className="size-2 rounded-full bg-pip" />}
      {t(`manual.origin.${origin}`)}
    </Badge>
  )
}

/** A read-only row: content, origin, who can see it, edit and delete. `shared` is null for people. */
export function Row(props: {
  children: React.ReactNode
  origin?: Origin
  shared: Recipient[] | null
  what: string
  rowKey: string
  saved: boolean
  onEdit: () => void
  onDelete: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <li className="flex items-start gap-2 border-t px-5 py-4 first:border-t-0">
      <div className="min-w-0 flex-1">
        <div className="max-w-[62ch] text-[17px] leading-[1.6]">{props.children}</div>
        {(props.shared || props.saved) && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {props.origin && props.shared && (
              <>
                <OriginBadge origin={props.origin} />
                <Shared visibleTo={props.shared} />
              </>
            )}
            {props.saved && (
              <span
                role="status"
                className="inline-flex items-center gap-1 text-sm font-bold text-primary"
              >
                <Check className="size-4" aria-hidden /> {t('manual.saved')}
              </span>
            )}
          </div>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className={touch}
        data-edit={props.rowKey}
        aria-label={t('manual.edit', { what: props.what })}
        onClick={props.onEdit}
      >
        <Pencil />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={touch}
        aria-label={t('manual.delete', { what: props.what })}
        onClick={props.onDelete}
      >
        <Trash2 />
      </Button>
    </li>
  )
}

function FieldError({
  id,
  children
}: {
  id: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div id={id} role="alert" className="flex items-center gap-2 text-sm font-bold text-primary">
      <Info className="size-4 shrink-0" aria-hidden /> {children}
    </div>
  )
}

/** Inline editor for an entry, strategy or person. One Save covers text and recipients. */
export function Editor(props: {
  kind: Kind
  initial?: Partial<Draft>
  onSave: (d: Draft) => Promise<boolean>
  onCancel: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const uid = useId()
  const [d, setD] = useState<Draft>({
    text: '',
    minutes: '',
    name: '',
    role: '',
    visibleTo: [],
    ...props.initial
  })
  const [error, setError] = useState<'text' | 'minutes' | 'pair' | null>(null)
  const [failed, setFailed] = useState(false)
  const set = (p: Partial<Draft>): void => setD((x) => ({ ...x, ...p }))
  const minutes = Number(d.minutes)

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setFailed(false)
    if (props.kind === 'person') {
      if (!d.name.trim() || !d.role.trim()) return setError('pair')
    } else if (!d.text.trim()) return setError('text')
    else if (props.kind === 'strategy' && !(Number.isInteger(minutes) && minutes >= 1))
      return setError('minutes')
    setError(null)
    if (!(await props.onSave(d))) setFailed(true)
  }

  const err = (k: typeof error): object =>
    error === k ? { 'aria-invalid': true, 'aria-describedby': `${uid}-err` } : {}
  const message = {
    text: t('manual.validation'),
    minutes: t('manual.validationMinutes'),
    pair: t('manual.validationName')
  }

  return (
    <li className="border-t bg-muted px-5 py-4 first:border-t-0">
      <form
        onSubmit={submit}
        onKeyDown={(e) => e.key === 'Escape' && props.onCancel()}
        className="grid gap-4"
        noValidate
      >
        <p className="text-sm text-muted-foreground">{t(`manual.editor.hint.${props.kind}`)}</p>
        {props.kind === 'person' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor={`${uid}-n`}>{t('manual.people.name')}</Label>
              <Input
                id={`${uid}-n`}
                autoFocus
                className="min-h-11 bg-background"
                value={d.name}
                onChange={(e) => set({ name: e.target.value })}
                {...err('pair')}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${uid}-r`}>{t('manual.people.role')}</Label>
              <Input
                id={`${uid}-r`}
                className="min-h-11 bg-background"
                value={d.role}
                onChange={(e) => set({ role: e.target.value })}
                {...err('pair')}
              />
            </div>
          </div>
        ) : props.kind === 'strategy' ? (
          <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
            <div className="grid gap-2">
              <Label htmlFor={`${uid}-t`}>{t('manual.calming.label')}</Label>
              <Input
                id={`${uid}-t`}
                autoFocus
                className="min-h-11 bg-background"
                placeholder={t('manual.calming.placeholder')}
                value={d.text}
                onChange={(e) => set({ text: e.target.value })}
                {...err('text')}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${uid}-m`}>
                {t('manual.calming.minutes')} ({t('manual.calming.unit')})
              </Label>
              <Input
                id={`${uid}-m`}
                type="number"
                min={1}
                className="min-h-11 bg-background"
                value={d.minutes}
                onChange={(e) => set({ minutes: e.target.value })}
                {...err('minutes')}
              />
            </div>
          </div>
        ) : (
          <div className="grid gap-2">
            <Label htmlFor={`${uid}-t`}>{t('manual.editor.entry')}</Label>
            <Textarea
              id={`${uid}-t`}
              autoFocus
              className="min-h-24 bg-background text-[17px] leading-[1.6]"
              value={d.text}
              onChange={(e) => set({ text: e.target.value })}
              {...err('text')}
            />
          </div>
        )}
        {error && <FieldError id={`${uid}-err`}>{message[error]}</FieldError>}

        {props.kind !== 'person' && (
          <fieldset className="grid gap-2">
            <legend className="text-sm font-bold">{t('manual.editor.whoCanSee')}</legend>
            <p className="text-sm text-muted-foreground">{t('manual.editor.leaveUnticked')}</p>
            <p className="text-sm text-muted-foreground">{t('manual.editor.sharingNote')}</p>
            <div className="flex flex-wrap gap-2">
              {Recipient.options.map((r) => (
                <Label
                  key={r}
                  htmlFor={`${uid}-${r}`}
                  className="min-h-11 cursor-pointer rounded-md border bg-background px-3 text-base font-normal"
                >
                  <Checkbox
                    id={`${uid}-${r}`}
                    checked={d.visibleTo.includes(r)}
                    onCheckedChange={(on) =>
                      set({
                        visibleTo: on ? [...d.visibleTo, r] : d.visibleTo.filter((x) => x !== r)
                      })
                    }
                  />
                  {t(`manual.recipients.${r}`)}
                </Label>
              ))}
            </div>
          </fieldset>
        )}

        {failed && <FieldError id={`${uid}-fail`}>{t('manual.saveError')}</FieldError>}
        <div className="flex gap-2">
          <Button type="submit" className="min-h-11">
            {props.initial ? t('manual.save') : t(`manual.submitNew.${props.kind}`)}
          </Button>
          <Button type="button" variant="outline" className="min-h-11" onClick={props.onCancel}>
            {t('manual.cancel')}
          </Button>
        </div>
      </form>
    </li>
  )
}

export function ConfirmDelete(props: {
  open: boolean
  title: string
  quote: string
  keep: string
  confirm: string
  failed: boolean
  onKeep: () => void
  onConfirm: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <Dialog open={props.open} onOpenChange={(o) => !o && props.onKeep()}>
      <DialogContent closeLabel={t('manual.close')}>
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
          <DialogDescription>{t('manual.dialog.body')}</DialogDescription>
        </DialogHeader>
        <blockquote className="rounded-md bg-muted p-3 text-[17px] leading-[1.6]">
          {props.quote}
        </blockquote>
        {props.failed && <FieldError id="delete-fail">{t('manual.saveError')}</FieldError>}
        <DialogFooter className="flex-col sm:flex-row sm:justify-start">
          <Button className="min-h-11" autoFocus onClick={props.onKeep}>
            {props.keep}
          </Button>
          <Button variant="outline" className="min-h-11" onClick={props.onConfirm}>
            <Trash2 aria-hidden /> {props.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** A collapsible card: heading, count, optional note, rows, and an add button. */
export function Block(props: {
  id: string
  title: string
  count: string
  emptyText: string
  note?: string
  open: boolean
  onOpenChange: (o: boolean) => void
  empty: boolean
  formOpen: boolean
  addLabel: string
  onAdd: () => void
  children: React.ReactNode
}): React.JSX.Element {
  const footer = !props.formOpen && (
    <div className="border-t px-3 py-1">
      <Button variant="ghost" className="min-h-11 text-primary" onClick={props.onAdd}>
        <Plus aria-hidden /> {props.addLabel}
      </Button>
    </div>
  )
  return (
    <Card id={props.id} className="scroll-mt-4 overflow-hidden gap-0 py-0 shadow-none">
      <div>
        <div className="flex items-center justify-between gap-2 px-5">
          <h2
            id={`${props.id}-h`}
            tabIndex={-1}
            className="min-w-0 flex-1 text-lg font-bold outline-none"
          >
            <button
              type="button"
              data-state={props.open ? 'open' : 'closed'}
              aria-expanded={props.open}
              aria-controls={`${props.id}-c`}
              onClick={() => props.onOpenChange(!props.open)}
              className="group flex min-h-11 w-full items-center gap-2 rounded-md text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <ChevronDown
                className="size-4 shrink-0 transition-transform duration-150 group-data-[state=closed]:-rotate-90"
                aria-hidden
              />
              {props.title}
            </button>
          </h2>
          {props.count && <span className="text-sm text-muted-foreground">{props.count}</span>}
        </div>
        {props.empty && (
          <p className="px-5 pb-3 pl-11 text-sm text-muted-foreground">{props.emptyText}</p>
        )}
        {props.empty && !props.open && footer}
        {/* Always mounted (only hidden) so an open form keeps its draft while collapsed. */}
        <div id={`${props.id}-c`} hidden={!props.open}>
          {props.note && <p className="px-5 pb-3 pl-11 text-sm text-body">{props.note}</p>}
          <ul>{props.children}</ul>
          {footer}
        </div>
      </div>
    </Card>
  )
}

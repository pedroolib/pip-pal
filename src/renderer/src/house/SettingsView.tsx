import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import {
  History,
  Keyboard,
  Languages,
  Moon,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sun,
  Sunrise,
  Sunset,
  Trash2,
  Wind,
  X
} from 'lucide-react'
import { MAX_CHECK_INS, type CheckInTime, type Settings, type UsageEvent } from '@shared/schemas'
import { api } from '@renderer/api'
import { Button } from '@renderer/components/ui/button'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { Switch } from '@renderer/components/ui/switch'
import { HouseCard, Page } from './parts'
import { applySettings, isMac, nextFreeTime, rowBucket, shortcutKeys, showTime } from './settings'
import { useLoad } from './useLoad'

const BUCKET_ICONS = { morning: Sunrise, midday: Sun, afternoon: Sunset, evening: Moon }

/** Fewer enabled check-ins than this shows a gentle suggestion; it never blocks. */
const SUGGESTED_CHECK_INS = 3

const iconChip = 'grid size-10 shrink-0 place-items-center rounded-full bg-secondary'

function Heading({
  Icon,
  children
}: {
  Icon: typeof Sun
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-3">
      <span className={iconChip}>
        <Icon className="size-6" aria-hidden />
      </span>
      <h2 className="text-[1.0625rem] leading-snug font-bold">{children}</h2>
    </div>
  )
}

/** Settings save as you make them. A failed save puts the control back and says so, calmly. */
export function SettingsView({
  onRunSetup
}: {
  /** Opens onboarding again; it saves its own progress. */
  onRunSetup: (settings: Settings) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const { data, failed, reload } = useLoad(() => api.getSettings())
  const [saved, setSaved] = useState<Settings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const settings = saved ?? data
  const seq = useRef(0)

  const change = (key: string, next: Settings): void => {
    const prev = settings
    if (!prev) return
    const mine = ++seq.current
    setSaved(next)
    setError(null)
    applySettings(next)
    api.saveSettings(next).catch(() => {
      if (mine !== seq.current) return // a later change superseded this one
      setSaved(prev)
      applySettings(prev)
      setError(key)
    })
  }
  const fail = (key: string): React.JSX.Element | null =>
    error === key ? (
      <p role="alert" className="text-sm text-body">
        {t('house.settings.saveFailed')}
      </p>
    ) : null

  const off = !settings
  const mac = isMac(navigator.platform || navigator.userAgent)
  const keys = shortcutKeys(mac)

  return (
    <Page title={t('house.titles.settings')} intro={t('house.settings.intro')}>
      {failed && (
        <HouseCard role="alert">
          <p>{t('house.settings.loadFailed')}</p>
          <Button
            onClick={reload}
            variant="outline"
            className="min-h-11 w-fit rounded-full border-2 px-5 font-bold"
          >
            {t('house.settings.retry')}
          </Button>
        </HouseCard>
      )}
      {off && !failed && (
        <p role="status" className="px-1 text-muted-foreground">
          {t('house.settings.loading')}
        </p>
      )}

      <CheckInTimes settings={settings} change={change} fail={fail} />

      <HouseCard>
        <Heading Icon={Keyboard}>{t('house.settings.shortcut.title')}</Heading>
        <div className="flex flex-wrap items-center gap-2">
          {keys.map((k, i) => (
            <span key={k} className="flex items-center gap-2">
              {i > 0 && !mac && <span aria-hidden>+</span>}
              <kbd className="rounded-[10px] border border-b-[3px] border-border bg-background px-3 py-2 text-[0.9375rem] leading-none font-bold">
                {k}
              </kbd>
            </span>
          ))}
        </div>
        <p>{t('house.settings.shortcut.body')}</p>
        <p className="text-sm text-muted-foreground">
          {t('house.settings.shortcut.fixed')}{' '}
          {!mac && <>{t('house.settings.shortcut.linux', { command: 'pip-pal --capture' })}</>}
        </p>
      </HouseCard>

      <div className="grid gap-4 sm:grid-cols-2">
        <HouseCard className="h-full">
          <Heading Icon={Languages}>
            <Label
              htmlFor="language"
              data-disabled={off || undefined}
              className="text-[1.0625rem] leading-snug font-bold"
            >
              {t('house.settings.language.title')}
            </Label>
          </Heading>
          <Select
            disabled={off}
            value={settings?.language ?? 'en'}
            onValueChange={(language) =>
              settings &&
              change('language', { ...settings, language: language as Settings['language'] })
            }
          >
            <SelectTrigger
              id="language"
              className="min-h-11 w-fit gap-2.5 rounded-full border-[1.5px] bg-surface px-4 font-bold"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">{t('house.settings.language.en')}</SelectItem>
              <SelectItem value="es">{t('house.settings.language.es')}</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">{t('house.settings.language.note')}</p>
          {fail('language')}
        </HouseCard>

        <HouseCard className="h-full">
          <div className="flex items-center gap-3">
            <span className={iconChip}>
              <Wind className="size-6" aria-hidden />
            </span>
            <Label
              htmlFor="calm"
              data-disabled={off || undefined}
              className="flex-1 text-[1.0625rem] leading-snug font-bold"
            >
              {t('house.settings.calm.title')}
            </Label>
            <Switch
              id="calm"
              disabled={off}
              checked={settings?.calmMotion ?? false}
              onCheckedChange={(calmMotion) =>
                settings && change('calm', { ...settings, calmMotion })
              }
            />
          </div>
          <p>{t('house.settings.calm.body')}</p>
          {fail('calm')}
        </HouseCard>
      </div>

      <HouseCard>
        <Heading Icon={ShieldCheck}>{t('house.settings.privacy.title')}</Heading>
        <p>{t('house.settings.privacy.selected')}</p>
        <p>{t('house.settings.privacy.manual')}</p>
      </HouseCard>

      <HouseCard>
        <Heading Icon={RotateCcw}>{t('onboarding.rerun.title')}</Heading>
        <p>{t('onboarding.rerun.body')}</p>
        <Button
          variant="outline"
          className="min-h-11 self-start rounded-full px-5 font-bold"
          disabled={!settings}
          onClick={() => settings && onRunSetup(settings)}
        >
          {t('onboarding.rerun.button')}
        </Button>
      </HouseCard>

      <Remembers />
    </Page>
  )
}

/** One short line per kind of event. Message text is rendered as plain text (React escapes it). */
function eventLine(e: UsageEvent, t: TFunction): string {
  switch (e.kind) {
    case 'decoded':
      return t('house.settings.remembers.decoded', { text: e.text })
    case 'action':
      return t(`house.settings.remembers.action.${e.action}`)
    case 'asked':
      return t('house.settings.remembers.asked', { text: e.question })
    case 'step':
      return t(`house.settings.remembers.step.${e.status}`, { text: e.text })
    case 'calm':
      return t(`house.settings.remembers.calm.${e.status}`)
  }
}

/** The local usage log, newest first: delete one, or all behind a confirm. */
function Remembers(): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const { data, failed, reload } = useLoad(() => api.listEvents())
  const [confirm, setConfirm] = useState(false)
  const [error, setError] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const events = [...(data ?? [])].sort((a, b) => b.at.localeCompare(a.at))

  async function run(go: () => Promise<void>): Promise<void> {
    setError(false)
    try {
      await go()
      setConfirm(false)
      reload()
      heading.current?.focus()
    } catch {
      setError(true)
    }
  }
  const when = (at: string): string =>
    new Date(at).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <HouseCard aria-labelledby="remembers-h">
      <div className="flex items-center gap-3">
        <span className={iconChip}>
          <History className="size-6" aria-hidden />
        </span>
        <h2
          id="remembers-h"
          ref={heading}
          tabIndex={-1}
          className="flex-1 text-[1.0625rem] leading-snug font-bold outline-none"
        >
          {t('house.settings.remembers.title')}
        </h2>
        <Button
          variant="outline"
          disabled={events.length === 0}
          onClick={() => setConfirm(true)}
          className="min-h-11 rounded-full border-2 px-5 font-bold"
        >
          <Trash2 className="size-5" aria-hidden />
          {t('house.settings.remembers.deleteAll')}
        </Button>
      </div>
      <p>{t('house.settings.remembers.body')}</p>
      <p className="text-sm text-muted-foreground">{t('house.settings.remembers.retention')}</p>
      {(failed || error) && (
        <p role="alert" className="text-sm text-body">
          {t(
            failed ? 'house.settings.remembers.loadFailed' : 'house.settings.remembers.deleteFailed'
          )}
        </p>
      )}
      {data && events.length === 0 && (
        <p className="font-bold">{t('house.settings.remembers.empty')}</p>
      )}
      <ul>
        {events.map((e) => (
          <li key={e.id} className="flex items-center gap-3 border-border py-3 not-first:border-t">
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 break-words">{eventLine(e, t)}</p>
              <p className="text-sm text-muted-foreground">{when(e.at)}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('house.settings.remembers.deleteOne', {
                what: eventLine(e, t),
                when: when(e.at)
              })}
              onClick={() => run(() => api.deleteEvent(e.id))}
              className="size-11 shrink-0 rounded-full focus-visible:ring-0 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring"
            >
              <Trash2 className="size-5" aria-hidden />
            </Button>
          </li>
        ))}
      </ul>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent closeLabel={t('manual.close')}>
          <DialogHeader>
            <DialogTitle>{t('house.settings.remembers.confirmTitle')}</DialogTitle>
            <DialogDescription>{t('house.settings.remembers.confirmBody')}</DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-sm text-body">
              {t('house.settings.remembers.deleteFailed')}
            </p>
          )}
          <DialogFooter className="flex-col sm:flex-row sm:justify-start">
            <Button
              className="min-h-11 rounded-full px-5"
              autoFocus
              onClick={() => setConfirm(false)}
            >
              {t('house.settings.remembers.keep')}
            </Button>
            <Button
              variant="outline"
              className="min-h-11 rounded-full px-5"
              onClick={() => run(() => api.clearEvents())}
            >
              <Trash2 aria-hidden /> {t('house.settings.remembers.confirmDelete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </HouseCard>
  )
}

/**
 * Editable check-in times: each row has a time, an on/off switch and a remove button. A time that is
 * already in the list, or not filled in yet, stays in the input without saving.
 */
function CheckInTimes({
  settings,
  change,
  fail
}: {
  settings: Settings | null | undefined
  change(key: string, next: Settings): void
  fail(key: string): React.JSX.Element | null
}): React.JSX.Element {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [taken, setTaken] = useState<string | null>(null)
  const addButton = useRef<HTMLButtonElement>(null)
  // After add or remove, focus moves to the new time or to "Add a time" once the list has rendered.
  const focusNext = useRef<string | null>(null)
  useEffect(() => {
    if (!focusNext.current) return
    const el =
      focusNext.current === 'add' ? addButton.current : document.getElementById(focusNext.current)
    el?.focus()
    focusNext.current = null
  })

  const list = settings?.checkIns ?? []
  const off = !settings
  const full = list.length >= MAX_CHECK_INS
  const save = (key: string, checkIns: CheckInTime[]): void => {
    if (settings) change(key, { ...settings, checkIns })
  }
  const dropDraft = (id: string): void =>
    setDraft((d) => {
      const rest = { ...d }
      delete rest[id]
      return rest
    })

  const edit = (id: string, time: string): void => {
    const clash = list.some((c) => c.id !== id && c.time === time)
    setTaken(clash ? id : null)
    if (!time || clash) return void setDraft((d) => ({ ...d, [id]: time }))
    dropDraft(id)
    save(
      id,
      list.map((c) => (c.id === id ? { ...c, time } : c))
    )
  }
  const add = (): void => {
    const id = crypto.randomUUID()
    focusNext.current = `time-${id}`
    save('add', [...list, { id, time: nextFreeTime(list.map((c) => c.time)), enabled: true }])
  }
  const leave = (id: string): void => {
    // Back to the last saved time, so the row never shows a time that isn't saved.
    dropDraft(id)
    if (taken === id) setTaken(null)
  }
  const remove = (id: string): void => {
    dropDraft(id)
    if (taken === id) setTaken(null)
    focusNext.current = 'add'
    save(
      id,
      list.filter((c) => c.id !== id)
    )
  }

  return (
    <HouseCard>
      <div>
        <h2 className="text-[1.0625rem] leading-snug font-bold">
          {t('house.settings.checkIns.title')}
        </h2>
        <p className="mt-1">{t('house.settings.checkIns.body')}</p>
      </div>
      <div>
        {list.map((c) => {
          const shown = draft[c.id] || c.time
          const bucket = rowBucket(shown)
          const Icon = BUCKET_ICONS[bucket]
          return (
            <div
              key={c.id}
              className="flex flex-wrap items-center gap-x-3.5 gap-y-1 border-border py-3 not-first:border-t"
            >
              <span className={iconChip}>
                <Icon className="size-6" aria-hidden />
              </span>
              <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                <Label
                  htmlFor={`time-${c.id}`}
                  data-disabled={off || undefined}
                  className="font-bold"
                >
                  {t(`house.settings.checkIns.${bucket}`)}
                </Label>
                <Input
                  id={`time-${c.id}`}
                  type="time"
                  required
                  disabled={off}
                  value={draft[c.id] ?? c.time}
                  onChange={(e) => edit(c.id, e.target.value)}
                  onBlur={() => leave(c.id)}
                  aria-label={t('house.settings.checkIns.timeLabel', {
                    part: t(`house.settings.checkIns.${bucket}`),
                    time: showTime(shown)
                  })}
                  aria-invalid={taken === c.id || undefined}
                  aria-describedby={taken === c.id ? `taken-${c.id}` : undefined}
                  className="min-h-11 w-fit rounded-md border-[1.5px] bg-surface text-base focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
                />
              </div>
              <Switch
                aria-label={t('house.settings.checkIns.toggle', { time: showTime(c.time) })}
                disabled={off}
                checked={c.enabled}
                onCheckedChange={(enabled) =>
                  save(
                    c.id,
                    list.map((x) => (x.id === c.id ? { ...x, enabled } : x))
                  )
                }
              />
              <Button
                variant="ghost"
                size="icon"
                disabled={off}
                aria-label={t('house.settings.checkIns.remove', { time: showTime(c.time) })}
                onClick={() => remove(c.id)}
                className="size-11 rounded-full focus-visible:ring-0 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring"
              >
                <X className="size-5" aria-hidden />
              </Button>
              <div className="basis-full pl-[54px] empty:hidden">
                <p id={`taken-${c.id}`} role="status" className="text-sm text-body empty:hidden">
                  {taken === c.id &&
                    t('house.settings.checkIns.taken', { time: showTime(draft[c.id]) })}
                </p>
                {fail(c.id)}
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button
          ref={addButton}
          onClick={add}
          disabled={off || full}
          variant="outline"
          className="min-h-11 w-fit rounded-full border-2 px-5 font-bold"
        >
          <Plus className="size-5" aria-hidden />
          {t('house.settings.checkIns.add')}
        </Button>
        <p role="status" className="text-sm text-muted-foreground empty:hidden">
          {full && t('house.settings.checkIns.max')}
        </p>
      </div>
      {fail('add')}
      <p role="status" className="text-sm text-muted-foreground empty:hidden">
        {settings &&
          list.filter((c) => c.enabled).length < SUGGESTED_CHECK_INS &&
          t('house.settings.checkIns.fewNote')}
      </p>
    </HouseCard>
  )
}

// First-run setup in Pip's House (docs/DECISIONS.md §13). Every step can be skipped; the step and the
// answers are saved as the person goes, so quitting resumes here. Nothing leaves the machine before `consent`.
import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, X } from 'lucide-react'
import {
  ONBOARDING_STEPS,
  enabledTimes,
  slotForHour,
  type Onboarding as Progress,
  type OnboardingAnswers,
  type OnboardingStep,
  type Profile,
  type Settings
} from '@shared/schemas'
import { scrubForModel } from '@shared/profile'
import stepsJson from '@shared/fixtures/demo.expansion.steps.json'
import { api } from '@renderer/api'
import { Button } from '@renderer/components/ui/button'
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
import { Textarea } from '@renderer/components/ui/textarea'
import { CheckInCard } from '@renderer/checkin/CheckInCard'
import { HouseCard } from '@renderer/house/parts'
import { applySettings, isMac, shortcutKeys, showTime } from '@renderer/house/settings'
import { addAlias, approvePending, dismissPending } from '@renderer/manual/model'
import { PendingCard } from '@renderer/manual/parts'
import { Pip, type Mood } from '@renderer/pip/Pip'
import { QUESTIONS, addChip, keepWords, nextStep, prevStep, stepIndex } from './model'

const MOOD: Record<OnboardingStep, Mood> = {
  welcome: 'hello',
  comfort: 'calm',
  privacy: 'showing',
  people: 'listening',
  consent: 'gentle',
  about: 'listening',
  review: 'reading',
  spoons: 'gentle',
  permission: 'calm',
  practice: 'showing',
  home: 'celebrate'
}

const pill = 'min-h-11 rounded-full px-5 font-bold'

/** Steps whose screen has its own primary button; the footer offers a skip there instead. */
const OWN_ACTION: OnboardingStep[] = ['people', 'consent', 'about']

export function Onboarding({
  settings: initial,
  start,
  onDone
}: {
  settings: Settings
  start: Progress
  onDone: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [settings, setSettings] = useState(initial)
  const [ob, setOb] = useState(start)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [saveFailed, setSaveFailed] = useState(false)
  // Asked again after a restart: consent is never assumed from a saved step.
  const [mode, setMode] = useState<'send' | 'keep' | null>(null)
  // Why the review shows the person's own words instead of suggestions.
  const [kept, setKept] = useState<'failed' | 'choice' | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    api.getProfile().then(setProfile, () => setSaveFailed(true))
  }, [])
  useEffect(() => {
    heading.current?.focus()
  }, [ob.step])

  /** Saves settings (and progress with them); a failure is shown but never blocks the person. */
  const saveSettings = (next: Settings): void => {
    setSettings(next)
    setSaveFailed(false)
    api.saveSettings(next).catch(() => setSaveFailed(true))
  }
  const go = (step: OnboardingStep | null, patch: Partial<Progress> = {}): void => {
    // Done (finished or skipped): the raw answers are no longer needed, so they don't linger in settings.json.
    const next = { ...ob, ...patch, ...(step ? { step } : { done: true, answers: {} }) }
    setOb(next)
    saveSettings({ ...settings, onboarding: next })
    if (!step) onDone()
  }
  const forward = (patch?: Partial<Progress>): void => go(nextStep(ob.step), patch)
  const saveProfile = async (p: Profile): Promise<boolean> => {
    try {
      await api.saveProfile(p)
      setProfile(p)
      return true
    } catch {
      return false
    }
  }

  const n = stepIndex(ob.step) + 1
  const total = ONBOARDING_STEPS.length
  const back = prevStep(ob.step)
  const last = ob.step === 'home'
  // Questions come only after consent; a resumed `about` asks for it again.
  const step = ob.step === 'about' && !mode ? 'consent' : ob.step

  return (
    <main className="mx-auto flex w-full max-w-[720px] min-w-0 flex-col gap-5 p-4 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        <div className="flex items-center gap-3">
          <ol className="flex gap-1.5" aria-hidden>
            {ONBOARDING_STEPS.map((s, i) => (
              <li
                key={s}
                className={`size-2.5 rounded-full ${i < n ? 'bg-primary' : 'bg-border'}`}
              />
            ))}
          </ol>
          <span className="text-sm text-muted-foreground">
            {t('onboarding.progress', { n, total })}
          </span>
        </div>
        {!last && (
          <Button variant="ghost" className="text-primary" onClick={() => go(null)}>
            {t('onboarding.skipAll')}
          </Button>
        )}
      </div>

      <HouseCard className="gap-5">
        <div className="flex items-start gap-4">
          <Pip mood={MOOD[step]} size={64} className="shrink-0" />
          <h1
            ref={heading}
            tabIndex={-1}
            className="pt-3 text-[1.75rem] leading-tight font-bold outline-none"
          >
            {t(`onboarding.${step}.title`)}
          </h1>
        </div>

        {step === 'welcome' && <Welcome onStart={() => forward()} />}
        {step === 'comfort' && <Comfort settings={settings} onChange={saveSettings} />}
        {step === 'privacy' && profile && <Privacy profile={profile} />}
        {step === 'people' && profile && (
          <People profile={profile} onSave={(p) => saveProfile(p).then((ok) => ok && forward())} />
        )}
        {step === 'consent' && (
          <Consent
            onPick={(m) => {
              setMode(m)
              go('about')
            }}
          />
        )}
        {step === 'about' && profile && mode && (
          <About
            answers={ob.answers}
            onAnswers={(answers) => go('about', { answers })}
            onFinish={async (answers) => {
              const any = QUESTIONS.some((q) => answers[q]?.trim())
              if (!any) return go('review', { answers })
              const keep = async (): Promise<void> => {
                const label = (q: (typeof QUESTIONS)[number]): string =>
                  t(`onboarding.about.labels.${q}`)
                await saveProfile(keepWords(profile, answers, label))
              }
              if (mode === 'keep') {
                await keep()
                setKept('choice')
              } else {
                try {
                  setProfile(await api.draftProfile(answers))
                } catch {
                  await keep()
                  setKept('failed')
                }
              }
              go('review', { answers })
            }}
          />
        )}
        {step === 'review' && profile && (
          <Review
            profile={profile}
            kept={kept}
            onApprove={(id, text) => saveProfile(approvePending(profile, id, text))}
            onDismiss={(id) => saveProfile(dismissPending(profile, id, new Date()))}
          />
        )}
        {step === 'spoons' && <Spoons settings={settings} />}
        {step === 'permission' && <Permission />}
        {step === 'practice' && <Practice />}
        {step === 'home' && (
          <>
            <p className="text-body">{t('onboarding.home.body')}</p>
            <p className="text-body">{t('onboarding.home.again')}</p>
          </>
        )}

        {saveFailed && (
          <p role="alert" className="text-sm font-bold text-primary">
            {t('onboarding.saveFailed')}
          </p>
        )}

        {/* Steps with their own primary action draw it themselves; only those need a separate skip
            (elsewhere Continue already moves on without doing anything). Skipping consent skips the questions. */}
        {step !== 'welcome' && (
          <div className="flex flex-wrap gap-2 border-t pt-4">
            {back && (
              <Button variant="outline" className={pill} onClick={() => go(back)}>
                {t('onboarding.back')}
              </Button>
            )}
            {OWN_ACTION.includes(step) ? (
              <Button
                variant="ghost"
                className={pill}
                onClick={() => (step === 'consent' ? go('review') : forward())}
              >
                {t('onboarding.skipStep')}
              </Button>
            ) : (
              <Button className={pill} onClick={() => (last ? go(null) : forward())}>
                {last ? t('onboarding.home.done') : t('onboarding.next')}
              </Button>
            )}
          </div>
        )}
      </HouseCard>
    </main>
  )
}

function Welcome({ onStart }: { onStart: () => void }): React.JSX.Element {
  const { t } = useTranslation()
  const list = t('onboarding.welcome.list', { returnObjects: true }) as string[]
  return (
    <>
      <p className="text-body">{t('onboarding.welcome.body')}</p>
      <ol className="ml-6 list-decimal space-y-1 text-[17px] leading-[1.6]">
        {list.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ol>
      <p className="text-body">{t('onboarding.welcome.time')}</p>
      <Button size="lg" className={`${pill} self-start`} onClick={onStart}>
        {t('onboarding.welcome.start')}
      </Button>
    </>
  )
}

function Comfort({
  settings,
  onChange
}: {
  settings: Settings
  onChange: (s: Settings) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const set = (next: Settings): void => {
    applySettings(next)
    onChange(next)
  }
  return (
    <>
      <p className="text-body">{t('onboarding.comfort.body')}</p>
      <div className="grid gap-2">
        <Label htmlFor="ob-language">{t('house.settings.language.title')}</Label>
        <Select
          value={settings.language}
          onValueChange={(language) =>
            set({ ...settings, language: language as Settings['language'] })
          }
        >
          <SelectTrigger id="ob-language" className="min-h-11 w-60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="en">{t('house.settings.language.en')}</SelectItem>
            <SelectItem value="es">{t('house.settings.language.es')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <Label htmlFor="ob-motion">{t('onboarding.comfort.motion')}</Label>
          <p className="text-sm text-muted-foreground">{t('onboarding.comfort.motionNote')}</p>
        </div>
        <Switch
          id="ob-motion"
          checked={settings.calmMotion}
          onCheckedChange={(calmMotion) => set({ ...settings, calmMotion })}
        />
      </div>
    </>
  )
}

function Privacy({ profile }: { profile: Profile }): React.JSX.Element {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const rules = t('onboarding.privacy.rules', { returnObjects: true }) as string[]
  const typed = name.trim() || t('onboarding.privacy.tryPlaceholder')
  // The real scrubber, with the typed name as the manager: exactly what would leave the machine.
  const sent = scrubForModel(t('onboarding.privacy.tryMessage', { name: typed }), {
    ...profile,
    people: [{ name: typed, role: 'Manager' }]
  }).text
  return (
    <>
      <ul className="ml-6 list-disc space-y-1 text-[17px] leading-[1.6]">
        {rules.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
      <div className="grid gap-2">
        <Label htmlFor="ob-try">{t('onboarding.privacy.tryLabel')}</Label>
        <Input
          id="ob-try"
          className="min-h-11 max-w-sm"
          placeholder={t('onboarding.privacy.tryPlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <p className="text-sm text-muted-foreground">{t('onboarding.privacy.trySent')}</p>
        <p aria-live="polite" className="rounded-md bg-muted px-4 py-3 font-mono text-[15px]">
          {sent}
        </p>
      </div>
    </>
  )
}

type Row = { name: string; role: string; aliases: string }

function People({
  profile,
  onSave
}: {
  profile: Profile
  onSave: (p: Profile) => Promise<unknown>
}): React.JSX.Element {
  const { t } = useTranslation()
  const uid = useId()
  const roles = t('onboarding.people.roles', { returnObjects: true }) as string[]
  const [name, setName] = useState(profile.name)
  const [role, setRole] = useState(profile.role)
  const [rows, setRows] = useState<Row[]>(() =>
    profile.people.length
      ? profile.people.map((p) => ({ ...p, aliases: (p.aliases ?? []).join(', ') }))
      : [{ name: '', role: roles[0], aliases: '' }]
  )
  const [error, setError] = useState(false)
  const patch = (i: number, r: Partial<Row>): void =>
    setRows((xs) => xs.map((x, j) => (j === i ? { ...x, ...r } : x)))

  const save = (): void => {
    const named = rows.filter((r) => r.name.trim())
    if (named.some((r) => !r.role.trim())) return setError(true)
    setError(false)
    const aliases = (text: string): string[] | undefined => {
      const a = addAlias([], text)
      return a.length ? a : undefined
    }
    void onSave({
      ...profile,
      name: name.trim(),
      role: role.trim(),
      people: named.map((r) => ({
        name: r.name.trim(),
        role: r.role.trim(),
        aliases: aliases(r.aliases)
      }))
    })
  }

  return (
    <>
      <p className="text-body">{t('onboarding.people.body')}</p>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 font-bold">{t('onboarding.people.you')}</legend>
        <div className="grid gap-2">
          <Label htmlFor={`${uid}-me`}>{t('onboarding.people.yourName')}</Label>
          <Input
            id={`${uid}-me`}
            className="min-h-11"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${uid}-job`}>{t('onboarding.people.yourRole')}</Label>
          <Input
            id={`${uid}-job`}
            className="min-h-11"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          />
        </div>
      </fieldset>
      <fieldset className="grid gap-4">
        <legend className="mb-2 font-bold">{t('onboarding.people.others')}</legend>
        {rows.map((r, i) => (
          <div key={i} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_1fr_auto]">
            <div className="grid gap-1">
              <Label htmlFor={`${uid}-n${i}`}>{t('onboarding.people.name')}</Label>
              <Input
                id={`${uid}-n${i}`}
                className="min-h-11"
                value={r.name}
                onChange={(e) => patch(i, { name: e.target.value })}
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor={`${uid}-r${i}`}>{t('onboarding.people.role')}</Label>
              <Input
                id={`${uid}-r${i}`}
                className="min-h-11"
                list={`${uid}-roles`}
                value={r.role}
                onChange={(e) => patch(i, { role: e.target.value })}
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-11 self-end"
              aria-label={t('onboarding.people.remove', {
                name: r.name || t('onboarding.people.unnamed')
              })}
              onClick={() => setRows((xs) => xs.filter((_, j) => j !== i))}
            >
              <X />
            </Button>
            <div className="grid gap-1 sm:col-span-3">
              <Label htmlFor={`${uid}-a${i}`}>{t('onboarding.people.aliases')}</Label>
              <Input
                id={`${uid}-a${i}`}
                className="min-h-11"
                aria-describedby={`${uid}-ah`}
                value={r.aliases}
                onChange={(e) => patch(i, { aliases: e.target.value })}
              />
            </div>
          </div>
        ))}
        <p id={`${uid}-ah`} className="text-sm text-muted-foreground">
          {t('onboarding.people.aliasesHint')}
        </p>
        <datalist id={`${uid}-roles`}>
          {roles.map((x) => (
            <option key={x} value={x} />
          ))}
        </datalist>
        <Button
          variant="outline"
          className={`${pill} self-start`}
          onClick={() => setRows((xs) => [...xs, { name: '', role: roles[0], aliases: '' }])}
        >
          <Plus aria-hidden /> {t('onboarding.people.add')}
        </Button>
      </fieldset>
      {error && (
        <p role="alert" className="text-sm font-bold text-primary">
          {t('onboarding.people.needRole')}
        </p>
      )}
      <Button className={`${pill} self-start`} onClick={save}>
        {t('onboarding.next')}
      </Button>
    </>
  )
}

function Consent({ onPick }: { onPick: (m: 'send' | 'keep') => void }): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <>
      <p className="text-[17px] leading-[1.6]">{t('onboarding.consent.body')}</p>
      <p className="text-sm text-muted-foreground">{t('onboarding.consent.keepNote')}</p>
      <div className="flex flex-wrap gap-2">
        <Button className={pill} onClick={() => onPick('send')}>
          {t('onboarding.consent.send')}
        </Button>
        <Button variant="outline" className={pill} onClick={() => onPick('keep')}>
          {t('onboarding.consent.keep')}
        </Button>
      </div>
    </>
  )
}

function About({
  answers: saved,
  onAnswers,
  onFinish
}: {
  answers: OnboardingAnswers
  onAnswers: (a: OnboardingAnswers) => void
  onFinish: (a: OnboardingAnswers) => Promise<void>
}): React.JSX.Element {
  const { t } = useTranslation()
  const uid = useId()
  const [i, setI] = useState(0)
  const [answers, setAnswers] = useState(saved)
  const [writing, setWriting] = useState(false)
  const q = QUESTIONS[i]
  const chips = t(`onboarding.about.chips.${q}`, { returnObjects: true }) as string[]
  const lastQ = i === QUESTIONS.length - 1

  if (writing)
    return (
      <div role="status" className="grid gap-1">
        <p className="font-bold">{t('onboarding.writing')}</p>
        <p className="text-sm text-muted-foreground">{t('onboarding.writingNote')}</p>
      </div>
    )

  const move = (to: number): void => {
    onAnswers(answers)
    setI(to)
  }
  return (
    <>
      <p className="text-sm text-muted-foreground">
        {t('onboarding.about.counter', { n: i + 1, total: QUESTIONS.length })}
      </p>
      <Label htmlFor={`${uid}-${q}`} className="text-[1.25rem] leading-snug font-bold">
        {t(`onboarding.about.questions.${q}`)}
      </Label>
      <p className="text-sm text-body">{t('onboarding.about.examples')}</p>
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <Button
            key={c}
            variant="secondary"
            className="min-h-11 rounded-full"
            onClick={() => setAnswers((a) => ({ ...a, [q]: addChip(a[q], c) }))}
          >
            {c}
          </Button>
        ))}
      </div>
      <Textarea
        id={`${uid}-${q}`}
        className="min-h-28 bg-background text-[17px] leading-[1.6]"
        placeholder={t('onboarding.about.placeholder')}
        maxLength={1000}
        value={answers[q] ?? ''}
        onChange={(e) => setAnswers((a) => ({ ...a, [q]: e.target.value }))}
      />
      <div className="flex flex-wrap gap-2">
        {i > 0 && (
          <Button variant="outline" className={pill} onClick={() => move(i - 1)}>
            {t('onboarding.about.previous')}
          </Button>
        )}
        <Button
          className={pill}
          onClick={() => {
            if (!lastQ) return move(i + 1)
            setWriting(true)
            void onFinish(answers)
          }}
        >
          {lastQ ? t('onboarding.about.finish') : t('onboarding.next')}
        </Button>
      </div>
    </>
  )
}

function Review({
  profile,
  kept,
  onApprove,
  onDismiss
}: {
  profile: Profile
  kept: 'failed' | 'choice' | null
  onApprove: (id: string, text?: string) => Promise<boolean>
  onDismiss: (id: string) => Promise<boolean>
}): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <>
      {kept && (
        <p role="status" className="text-[17px] leading-[1.6]">
          {t(kept === 'failed' ? 'onboarding.review.kept' : 'onboarding.review.keptByChoice')}
        </p>
      )}
      {profile.pending?.length ? (
        <>
          <p className="text-body">{t('onboarding.review.body')}</p>
          <PendingCard entries={profile.pending} onApprove={onApprove} onDismiss={onDismiss} />
        </>
      ) : (
        !kept && <p className="text-body">{t('onboarding.review.none')}</p>
      )}
    </>
  )
}

function Spoons({ settings }: { settings: Settings }): React.JSX.Element {
  const { t } = useTranslation()
  const [done, setDone] = useState(false)
  const times = enabledTimes(settings)
  return (
    <>
      <p className="text-[17px] leading-[1.6]">{t('onboarding.spoons.body')}</p>
      <p className="text-body">
        {times.length
          ? t('onboarding.spoons.times', { times: times.map(showTime).join(', ') })
          : t('onboarding.spoons.noTimes')}
      </p>
      {done ? (
        <p role="status" className="font-bold">
          {t('onboarding.spoons.done')}
        </p>
      ) : (
        <>
          <p className="text-body">{t('onboarding.spoons.first')}</p>
          <CheckInCard
            onAnswer={(spoons) => {
              const now = new Date()
              api
                .saveCheckIn({ at: now.toISOString(), slot: slotForHour(now.getHours()), spoons })
                .then(
                  () => setDone(true),
                  () => setDone(true)
                )
            }}
            onSnooze={() => setDone(true)}
          />
        </>
      )}
    </>
  )
}

function Permission(): React.JSX.Element {
  const { t } = useTranslation()
  // undefined while checking; null on systems that need no permission.
  const [granted, setGranted] = useState<boolean | null | undefined>(undefined)
  const [asked, setAsked] = useState(false)
  useEffect(() => {
    const check = (): void =>
      void api.checkAccessibility(false).then(setGranted, () => setGranted(false))
    check()
    // The system window is elsewhere: re-check when the person comes back.
    window.addEventListener('focus', check)
    return () => window.removeEventListener('focus', check)
  }, [])
  const linux = /linux/i.test(navigator.userAgent)

  if (granted === undefined) return <></>
  if (granted === null)
    return (
      <>
        <p className="text-body">{t('onboarding.permission.none')}</p>
        {linux && (
          <p className="text-body">
            {t('onboarding.permission.linux', { command: 'pip-pal --capture' })}
          </p>
        )}
      </>
    )
  return (
    <>
      <p className="text-[17px] leading-[1.6]">{t('onboarding.permission.mac')}</p>
      {granted ? (
        <p role="status" className="font-bold">
          {t('onboarding.permission.granted')}
        </p>
      ) : (
        <>
          <Button
            className={`${pill} self-start`}
            onClick={() => {
              setAsked(true)
              void api.checkAccessibility(true).then(setGranted, () => {})
            }}
          >
            {t('onboarding.permission.open')}
          </Button>
          {asked && <p className="text-body">{t('onboarding.permission.waiting')}</p>}
        </>
      )}
    </>
  )
}

function Practice(): React.JSX.Element {
  const { t } = useTranslation()
  const [example, setExample] = useState(false)
  const mac = isMac(navigator.platform || navigator.userAgent)
  const keys = shortcutKeys(mac).join(mac ? '' : '+')
  const steps = t('onboarding.practice.steps', { returnObjects: true, keys }) as string[]
  return (
    <>
      <ol className="ml-6 list-decimal space-y-1 text-[17px] leading-[1.6]">
        {steps.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ol>
      <figure className="grid gap-1">
        <figcaption className="text-sm text-muted-foreground">
          {t('onboarding.practice.messageLabel')}
        </figcaption>
        <blockquote className="rounded-md border bg-background px-4 py-3 text-[17px] leading-[1.6] select-text">
          {t('onboarding.practice.message')}
        </blockquote>
      </figure>
      {example ? (
        <div className="grid gap-2 rounded-md bg-muted px-4 py-3">
          <p className="font-bold">{t('onboarding.practice.example')}</p>
          <p className="text-sm text-muted-foreground">{t('onboarding.practice.exampleTitle')}</p>
          <ol className="ml-6 list-decimal space-y-1">
            {stepsJson.steps.map((s) => (
              <li key={s.text}>{s.text}</li>
            ))}
          </ol>
        </div>
      ) : (
        <Button variant="outline" className={`${pill} self-start`} onClick={() => setExample(true)}>
          {t('onboarding.practice.noBubble')}
        </Button>
      )}
    </>
  )
}

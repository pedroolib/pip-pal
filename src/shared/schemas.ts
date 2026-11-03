// Shared contract between main (A), AI (B) and UI (C). Change only through a PR all three devs review.
import { z } from 'zod'

// ---------- Profile ("My user manual") ----------

/** Who a profile entry or summary can be shared with. An entry with no recipients is private. */
export const Recipient = z.enum(['coach', 'psychologist', 'therapist', 'manager'])
export type Recipient = z.infer<typeof Recipient>

/**
 * Who wrote an entry's current text: the person, Pip from onboarding answers, or Pip from usage patterns.
 * Pip's entries are saved only after the person accepts them; editing an entry's text makes it `self`.
 */
export const Origin = z.enum(['self', 'onboarding', 'learned'])
export type Origin = z.infer<typeof Origin>

/** Onboarding's "about you" questions, in the order they are asked. */
export const ONBOARDING_QUESTIONS = [
  'instructions',
  'changesHelp',
  'changesNotice',
  'calming',
  'sensory',
  'strengths'
] as const
export const OnboardingQuestion = z.enum(ONBOARDING_QUESTIONS)
export type OnboardingQuestion = z.infer<typeof OnboardingQuestion>

export const ProfileEntry = z.object({
  /** Stable id (crypto.randomUUID); filled by ensureIds for older files. */
  id: z.string().optional(),
  text: z.string().min(1),
  origin: Origin,
  visibleTo: z.array(Recipient),
  /** An onboarding answer kept word for word (no model call); Pip can still be asked to rewrite it. */
  fromAnswer: OnboardingQuestion.optional()
})
export type ProfileEntry = z.infer<typeof ProfileEntry>

/** Specialisterne's professional-profile sections, plus `changes` and `energy` (filled from check-ins). */
export const SECTIONS = [
  'experience',
  'languages',
  'communication',
  'teamwork',
  'feedback',
  'stress',
  'relationships',
  'sensory',
  'motivations',
  'strengths',
  'learning',
  'changes',
  'adjustments',
  'managerTips',
  'energy'
] as const
export const Section = z.enum(SECTIONS)
export type Section = z.infer<typeof Section>

export const CalmingStrategy = z.object({
  id: z.string().optional(),
  label: z.string().min(1),
  minutes: z.number().int().positive(),
  origin: Origin,
  visibleTo: z.array(Recipient)
})
export type CalmingStrategy = z.infer<typeof CalmingStrategy>

/** An entry Pip suggests, waiting for the person's approval. Never used or shared until approved. */
export const PendingEntry = z
  .object({
    id: z.string(),
    /** Stable per suggestion (e.g. `energy:morning`), so the same pattern is not suggested twice. */
    key: z.string().min(1),
    /** What it rests on: the numbers, or what the person said in onboarding (anti-masking). */
    why: z.string().min(1),
    /** A profile section, or `calming` for a calming strategy (then `text` is its label). */
    section: z.union([Section, z.literal('calming')]),
    text: z.string().min(1),
    /** Only, and always, for a calming strategy. */
    minutes: z.number().int().positive().optional(),
    origin: Origin.exclude(['self']),
    visibleTo: z.array(Recipient)
  })
  .refine((p) => (p.section === 'calming') === (p.minutes !== undefined), {
    message: 'A calming suggestion has minutes; a section suggestion has none.',
    path: ['minutes']
  })
export type PendingEntry = z.infer<typeof PendingEntry>

/** Nicknames, @handles and usernames; swapped like the name they belong to. */
const Aliases = z.array(z.string().trim().min(1)).optional()

export const Profile = z.object({
  name: z.string(),
  role: z.string(),
  aliases: Aliases, // the owner's own nicknames, swapped for [Me]
  /** Names here are swapped for their role before any text leaves the machine. */
  people: z.array(z.object({ name: z.string().min(1), role: z.string().min(1), aliases: Aliases })),
  sections: z.record(Section, z.array(ProfileEntry)),
  calmingStrategies: z.array(CalmingStrategy),
  pending: z.array(PendingEntry).optional(),
  /** Pattern keys the person dismissed; Pip stays quiet about them for DISMISS_DAYS. */
  dismissed: z.array(z.object({ key: z.string(), at: z.iso.datetime({ offset: true }) })).optional()
})
export type Profile = z.infer<typeof Profile>

// ---------- Decoding a selected message ----------

export const ChangeType = z.enum(['none', 'project', 'leader', 'priorities', 'other'])
export type ChangeType = z.infer<typeof ChangeType>

export const Tone = z.enum(['friendly', 'neutral', 'urgent', 'frustrated', 'unclear'])
export type Tone = z.infer<typeof Tone>

/** Fast labels from Jev, or from Claude when Jev is unavailable. Probabilities are 0–1. */
export const Classification = z.object({
  isChange: z.number().min(0).max(1),
  changeType: ChangeType,
  tone: Tone,
  urgency: z.number().int().min(1).max(5),
  isAmbiguous: z.number().min(0).max(1),
  source: z.enum(['jev', 'claude'])
})
export type Classification = z.infer<typeof Classification>

/** Claude's reading of the message (one heavy call). Replaced by triage + expand once the UI migrates. Every suggestion carries its why, so Pip teaches instead of masking. */
export const DecodeResult = z.object({
  summary: z.string(),
  asks: z.array(z.string()),
  deadline: z
    .object({
      text: z.string(),
      /** ISO date when one can be pinned down, else null. */
      date: z.string().nullable(),
      explicit: z.boolean()
    })
    .nullable(),
  implicitExpectations: z.array(z.object({ expectation: z.string(), why: z.string() })),
  /** All steps, in order. The UI shows at most 3 when spoons are low and marks the rest "can wait". */
  steps: z.array(z.object({ text: z.string(), why: z.string().nullable() })),
  change: z
    .object({
      type: ChangeType,
      transitionPlan: z.array(z.string()),
      questionsToAsk: z.array(z.string())
    })
    .nullable(),
  /** Shown as "Ask, don't guess" with the question already drafted. */
  uncertainties: z.array(z.object({ what: z.string(), suggestedQuestion: z.string() })),
  /** Makes Pip's memory visible: "Used your manual: you prefer written instructions". */
  profileUsed: z.array(z.object({ section: Section, how: z.string() }))
})
export type DecodeResult = z.infer<typeof DecodeResult>

export const Decoded = z.object({
  classification: Classification,
  decode: DecodeResult,
  /** True when the live call failed and the cached demo answer was used. */
  fromCache: z.boolean()
})
export type Decoded = z.infer<typeof Decoded>

// ---------- Triage (Jev, on the hotkey) and expansions (Claude, one per button) ----------

export const MessageType = z.enum(['request', 'question', 'fyi', 'feedback', 'change', 'social'])
export type MessageType = z.infer<typeof MessageType>

export const NeedsReply = z.enum(['yes', 'no', 'confirm_only'])
export type NeedsReply = z.infer<typeof NeedsReply>

export const UrgencyLevel = z.enum(['today', 'this_week', 'no_rush'])
export type UrgencyLevel = z.infer<typeof UrgencyLevel>

export const TriageTone = z.enum(['neutral', 'friendly', 'upset', 'worried'])
export type TriageTone = z.infer<typeof TriageTone>

export const Addressee = z.enum(['me', 'group', 'nobody'])
export type Addressee = z.infer<typeof Addressee>

/** The fields `Triage.unsure` can name. */
export const TriageField = z.enum([
  'type',
  'needsReply',
  'urgency',
  'deadline',
  'tone',
  'change',
  'task',
  'ambiguity',
  'addressee'
])
export type TriageField = z.infer<typeof TriageField>

/** One narrow Claude call per button. */
export const ActionKind = z.enum(['steps', 'questions', 'transition'])
export type ActionKind = z.infer<typeof ActionKind>

/** A part of the message Jev flagged as unclear; a hint for the `questions` call only. */
export const UnclearPart = z.enum(['deadline', 'what_or_who'])
export type UnclearPart = z.infer<typeof UnclearPart>

/** A label and how sure Jev is of it (0–1). */
const scored = <T extends z.ZodType>(value: T): z.ZodObject<{ value: T; p: z.ZodNumber }> =>
  z.object({ value, p: z.number().min(0).max(1) })

/** Jev's fast read of the selected message; no Claude involved. Which buttons appear comes from `actions`. */
export const Triage = z.object({
  type: scored(MessageType),
  needsReply: scored(NeedsReply),
  urgency: scored(UrgencyLevel).extend({
    /** True when the text says so ("today", "ASAP"); false when Jev inferred it. */
    explicit: z.boolean()
  }),
  deadline: z
    .object({
      text: z.string(),
      /** ISO date when one can be pinned down, else null. */
      date: z.string().nullable(),
      /** True when a date or time word is in the text; false when inferred. */
      explicit: z.boolean()
    })
    .nullable(),
  tone: scored(TriageTone),
  /** Probability that the message hands over a new task (offers "Break it into steps"). */
  isNewTask: z.number().min(0).max(1),
  /** Probability that the message announces a change (offers "Plan for this change"). */
  isChange: z.number().min(0).max(1),
  changeType: ChangeType,
  /** Probability that the timing is unclear. */
  deadlineUnclear: z.number().min(0).max(1),
  /** Probability that what to do, or with whom, is unclear. */
  whatOrWhoUnclear: z.number().min(0).max(1),
  addressee: scored(Addressee),
  /** Role from the profile's people list when the selection names its sender, else null. */
  senderRole: z.string().nullable(),
  /** Exact quotes from the message each field is based on, with names restored locally. */
  evidence: z
    .object({
      deadline: z.string(),
      urgency: z.string(),
      tone: z.string(),
      change: z.string()
    })
    .partial(),
  /** Fields too uncertain to state: the "Ask, don't guess" trigger. */
  unsure: z.array(TriageField),
  /** Buttons to offer, primary before maybe, then change, task, questions. Computed in code. */
  actions: z.array(z.object({ kind: ActionKind, strength: z.enum(['primary', 'maybe']) })),
  source: z.literal('jev')
})
export type Triage = z.infer<typeof Triage>

/** What a drafted question is about; Pip learns which kinds of vagueness the person keeps asking about. */
export const QuestionTopic = z.enum(['deadline', 'scope', 'priority', 'who', 'format', 'other'])
export type QuestionTopic = z.infer<typeof QuestionTopic>

const profileUsed = z.array(z.object({ section: Section, how: z.string() }))

/** What one button returns. Every suggestion carries its why, so Pip teaches instead of masking. */
export const Expansion = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('steps'),
    /** All steps, in order of importance; the UI trims to 3 when spoons are low. */
    steps: z.array(z.object({ text: z.string(), why: z.string().nullable() })),
    profileUsed
  }),
  z.object({
    kind: z.literal('questions'),
    /** `suggestedQuestion` is drafted, ready to send. */
    questions: z.array(
      z.object({ what: z.string(), suggestedQuestion: z.string(), topic: QuestionTopic })
    ),
    profileUsed
  }),
  z.object({
    kind: z.literal('transition'),
    plan: z.array(z.string()),
    questionsToAsk: z.array(z.string()),
    profileUsed
  })
])
export type Expansion = z.infer<typeof Expansion>

// ---------- Day-to-day log (stored locally) ----------

export const Slot = z.enum(['morning', 'midday', 'afternoon'])
export type Slot = z.infer<typeof Slot>

export const CheckIn = z.object({
  at: z.iso.datetime({ offset: true }),
  slot: Slot,
  spoons: z.number().int().min(1).max(5)
})
export type CheckIn = z.infer<typeof CheckIn>

/** Spoons at or below this trim the plan to 3 steps and offer a calming strategy. */
export const LOW_SPOONS = 2

export const ChangeEvent = z.object({
  at: z.iso.datetime({ offset: true }),
  type: ChangeType,
  summary: z.string()
})
export type ChangeEvent = z.infer<typeof ChangeEvent>

/** Calm wins only: no streaks, nothing counts missed days. */
export const Achievement = z.object({
  at: z.iso.datetime({ offset: true }),
  kind: z.enum(['step_done', 'change_navigated', 'asked_not_guessed']),
  label: z.string()
})
export type Achievement = z.infer<typeof Achievement>

// ---------- Usage log (stored locally, pruned after EVENT_RETENTION_DAYS) ----------

/** What the renderer may log. `decoded` and `action` are logged by main itself, so they are not accepted here. */
export const LoggableEvent = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('asked'),
    topic: QuestionTopic,
    question: z.string().min(1).max(2000)
  }),
  z.object({
    kind: z.literal('step'),
    status: z.enum(['done', 'can_wait']),
    text: z.string().min(1).max(2000)
  }),
  z.object({
    kind: z.literal('calm'),
    status: z.enum(['used', 'skipped']),
    strategyId: z.string().min(1).max(100).nullable()
  })
])
export type LoggableEvent = z.infer<typeof LoggableEvent>

const stamp = { id: z.string().min(1), at: z.iso.datetime({ offset: true }) }

/** A stored event: `id` and `at` are assigned in main. `decoded` keeps the raw text locally; it leaves only scrubbed. */
export const UsageEvent = z.discriminatedUnion('kind', [
  z.object({ ...stamp, ...LoggableEvent.options[0].shape }),
  z.object({ ...stamp, ...LoggableEvent.options[1].shape }),
  z.object({ ...stamp, ...LoggableEvent.options[2].shape }),
  z.object({
    ...stamp,
    kind: z.literal('decoded'),
    text: z.string(),
    isChange: z.number().min(0).max(1),
    changeType: ChangeType,
    isNewTask: z.number().min(0).max(1),
    tone: TriageTone
  }),
  z.object({ ...stamp, kind: z.literal('action'), action: ActionKind })
])
export type UsageEvent = z.infer<typeof UsageEvent>

export const EVENT_RETENTION_DAYS = 90
/** Pattern detection looks back this many days, needs this many sightings, and a dismissed key stays quiet for DISMISS_DAYS. */
export const LEARN_WINDOW_DAYS = 14
export const LEARN_MIN_COUNT = 3
export const DISMISS_DAYS = 30
/** Fewer check-ins than this in a summary period: plain facts only, no patterns. */
export const PATTERN_MIN_CHECKINS = 3

// ---------- "My summary" ----------

/** Rolling windows counted back from now; `today` means since local midnight. */
export const SummaryPeriod = z.enum(['today', '7d', '14d', '30d'])
export type SummaryPeriod = z.infer<typeof SummaryPeriod>

export const SummaryPoint = z.object({
  text: z.string(),
  /** The numbers behind the point (anti-masking). */
  why: z.string().nullable(),
  source: z.enum(['checkins', 'changes', 'achievements', 'profile']),
  /** The person unticks points before exporting. */
  include: z.boolean()
})
export type SummaryPoint = z.infer<typeof SummaryPoint>

export const Summary = z.object({
  recipient: Recipient,
  period: SummaryPeriod,
  from: z.iso.datetime({ offset: true }),
  to: z.iso.datetime({ offset: true }),
  points: z.array(SummaryPoint)
})
export type Summary = z.infer<typeof Summary>

// ---------- Settings (stored locally) ----------

/** A time of day Pip asks for spoons, "HH:MM" in 24 h. */
export const CheckInTime = z.object({
  id: z.string().min(1).max(64),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  enabled: z.boolean()
})
export type CheckInTime = z.infer<typeof CheckInTime>

/** Pip asks at most this many times a day. */
export const MAX_CHECK_INS = 6

/** Onboarding's screens, in order. The hotkey and check-ins work from `practice` on (`hotkeyReady`). */
export const ONBOARDING_STEPS = [
  'welcome',
  'comfort',
  'privacy',
  'people',
  'consent',
  'about',
  'review',
  'spoons',
  'permission',
  'practice',
  'home'
] as const
export const OnboardingStep = z.enum(ONBOARDING_STEPS)
export type OnboardingStep = z.infer<typeof OnboardingStep>

/** What the person typed for onboarding's "about you" questions; missing or empty means skipped. */
export const OnboardingAnswers = z.partialRecord(OnboardingQuestion, z.string().max(1000))
export type OnboardingAnswers = z.infer<typeof OnboardingAnswers>

/** Where onboarding is, so a person who quits resumes there. Answers stay on this machine unless sent. */
export const Onboarding = z.object({
  step: OnboardingStep,
  done: z.boolean(),
  answers: OnboardingAnswers
})
export type Onboarding = z.infer<typeof Onboarding>

/** True once the hotkey and check-ins may run: onboarding is done, or it reached its practice step. */
export const hotkeyReady = (o: Onboarding | undefined): boolean =>
  !!o && (o.done || ONBOARDING_STEPS.indexOf(o.step) >= ONBOARDING_STEPS.indexOf('practice'))

export const Settings = z.object({
  checkIns: z
    .array(CheckInTime)
    .max(MAX_CHECK_INS)
    .refine((ts) => new Set(ts.map((t) => t.time)).size === ts.length, 'Check-in times must differ')
    .refine((ts) => new Set(ts.map((t) => t.id)).size === ts.length, 'Check-in ids must differ'),
  language: z.enum(['en', 'es']),
  calmMotion: z.boolean(),
  /** Missing until onboarding starts. In demo mode main reports it done. */
  onboarding: Onboarding.optional()
})
export type Settings = z.infer<typeof Settings>

export const DEFAULT_SETTINGS: Settings = {
  checkIns: [
    { id: 'morning', time: '09:00', enabled: true },
    { id: 'midday', time: '13:00', enabled: true },
    { id: 'afternoon', time: '17:00', enabled: true }
  ],
  language: 'en',
  calmMotion: false
}

/** The slot an hour falls in: a check-in time, or one taken in between, counts for the slot it follows. */
export const slotForHour = (h: number): Slot =>
  h < 13 ? 'morning' : h < 17 ? 'midday' : 'afternoon'

/** The enabled check-in times, sorted. */
export const enabledTimes = (s: Settings): string[] =>
  s.checkIns
    .filter((c) => c.enabled)
    .map((c) => c.time)
    .sort()

export const onDay = (day: Date, time: string): Date =>
  new Date(day.getFullYear(), day.getMonth(), day.getDate(), +time.slice(0, 2), +time.slice(3, 5))

/** A check-in this close before (or any time after) a check-in time answers it. */
export const RECENT_MS = 30 * 60 * 1000

/**
 * The latest of `times` (sorted "HH:MM") that has passed today, if it is still unanswered, else null.
 * It is answered only by a check-in the same day at or after RECENT_MS before that time.
 */
export function dueCheckIn(times: string[], checkIns: CheckIn[], now: Date): string | null {
  const due = times.filter((t) => onDay(now, t) <= now).at(-1)
  if (!due) return null
  const since = onDay(now, due).getTime() - RECENT_MS
  const answered = checkIns.some((c) => {
    const at = new Date(c.at)
    return at.getTime() >= since && at.toDateString() === now.toDateString()
  })
  return answered ? null : due
}

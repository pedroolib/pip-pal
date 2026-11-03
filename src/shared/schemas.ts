// Shared contract between main (A), AI (B) and UI (C). Change only through a PR all three devs review.
import { z } from 'zod'

// ---------- Profile ("My user manual") ----------

/** Who a profile entry or summary can be shared with. An entry with no recipients is private. */
export const Recipient = z.enum(['coach', 'psychologist', 'therapist', 'manager'])
export type Recipient = z.infer<typeof Recipient>

/** Who wrote an entry. Pip-learned entries are saved only after the person approves them. */
export const Origin = z.enum(['coach', 'self', 'pip'])
export type Origin = z.infer<typeof Origin>

export const ProfileEntry = z.object({
  /** Stable id (crypto.randomUUID); filled by ensureIds for older files. */
  id: z.string().optional(),
  text: z.string().min(1),
  origin: Origin,
  visibleTo: z.array(Recipient)
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

/** An entry Pip suggests, waiting for the person's approval. Data model only for now. */
export const PendingEntry = z.object({
  id: z.string(),
  section: Section,
  text: z.string().min(1),
  origin: z.literal('pip'),
  visibleTo: z.array(Recipient)
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
  pending: z.array(PendingEntry).optional()
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
    questions: z.array(z.object({ what: z.string(), suggestedQuestion: z.string() })),
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

// ---------- "My summary" ----------

export const SummaryPoint = z.object({
  text: z.string(),
  source: z.enum(['checkins', 'changes', 'achievements', 'profile']),
  /** The person unticks points before exporting. */
  include: z.boolean()
})
export type SummaryPoint = z.infer<typeof SummaryPoint>

export const Summary = z.object({
  recipient: Recipient,
  from: z.iso.datetime({ offset: true }),
  to: z.iso.datetime({ offset: true }),
  points: z.array(SummaryPoint)
})
export type Summary = z.infer<typeof Summary>

// ---------- Settings (stored locally) ----------

export const Settings = z.object({
  // `satisfies` ties the keys to Slot: a new slot breaks the build until it gets a toggle.
  checkIns: z.object({
    morning: z.boolean(),
    midday: z.boolean(),
    afternoon: z.boolean()
  }) satisfies z.ZodType<Record<Slot, boolean>>,
  language: z.enum(['en', 'es']),
  calmMotion: z.boolean()
})
export type Settings = z.infer<typeof Settings>

export const DEFAULT_SETTINGS: Settings = {
  checkIns: { morning: true, midday: true, afternoon: true },
  language: 'en',
  calmMotion: false
}

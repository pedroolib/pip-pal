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
  id: z.string(),
  label: z.string().min(1),
  minutes: z.number().int().positive(),
  origin: Origin,
  visibleTo: z.array(Recipient)
})
export type CalmingStrategy = z.infer<typeof CalmingStrategy>

export const Profile = z.object({
  name: z.string(),
  role: z.string(),
  /** Names here are swapped for their role before any text leaves the machine. */
  people: z.array(z.object({ name: z.string().min(1), role: z.string().min(1) })),
  sections: z.record(Section, z.array(ProfileEntry)),
  calmingStrategies: z.array(CalmingStrategy)
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

/** Claude's reading of the message. Every suggestion carries its why, so Pip teaches instead of masking. */
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

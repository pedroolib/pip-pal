// Pure onboarding helpers: step order and the "keep my words" fallback. The screens live in Onboarding.tsx.
import {
  ONBOARDING_STEPS,
  type Onboarding,
  type OnboardingAnswers,
  type OnboardingStep,
  type Profile,
  type Section
} from '@shared/schemas'

/** The "about you" questions in the order they are asked. */
export const QUESTIONS = [
  'instructions',
  'changesHelp',
  'changesNotice',
  'calming',
  'sensory',
  'strengths'
] as const satisfies readonly (keyof OnboardingAnswers)[]
export type Question = (typeof QUESTIONS)[number]

/** Where each answer goes when it is kept word for word (no minutes, so calming lands in `stress`). */
const SECTION_OF: Record<Question, Section> = {
  instructions: 'communication',
  changesHelp: 'changes',
  changesNotice: 'changes',
  calming: 'stress',
  sensory: 'sensory',
  strengths: 'strengths'
}

export const FRESH: Onboarding = { step: 'welcome', done: false, answers: {} }

export const stepIndex = (s: OnboardingStep): number => ONBOARDING_STEPS.indexOf(s)

/** The step after `s`, or null after the last one. */
export const nextStep = (s: OnboardingStep): OnboardingStep | null =>
  ONBOARDING_STEPS[stepIndex(s) + 1] ?? null

/** The step before `s`, or null on the first one. */
export const prevStep = (s: OnboardingStep): OnboardingStep | null =>
  stepIndex(s) > 0 ? ONBOARDING_STEPS[stepIndex(s) - 1] : null

/**
 * Each non-empty answer, word for word, as a private `self` entry in its section. `label` names the
 * question ("Helps me calm down") so a bare answer like "music" still reads right later.
 */
export function keepWords(
  profile: Profile,
  answers: OnboardingAnswers,
  label: (q: Question) => string
): Profile {
  const sections = { ...profile.sections }
  for (const q of QUESTIONS) {
    const said = answers[q]?.trim()
    if (!said) continue
    const s = SECTION_OF[q]
    const entry = {
      id: crypto.randomUUID(),
      text: `${label(q)}: ${said}`,
      origin: 'self' as const,
      visibleTo: []
    }
    sections[s] = [...sections[s], entry]
  }
  return { ...profile, sections }
}

/** Appends `text` to an answer as a new phrase, unless the answer already says it. */
export function addChip(answer: string | undefined, text: string): string {
  const now = (answer ?? '').trim()
  if (now.toLowerCase().includes(text.toLowerCase())) return now
  return now ? `${now.replace(/[.,;]$/, '')}, ${text.toLowerCase()}` : text
}

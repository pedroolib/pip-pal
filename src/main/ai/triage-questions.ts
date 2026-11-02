// Everything Jev is asked for a triage, in one place to audit and edit: wording, options, thresholds, and the code that
// turns its answers into Triage fields, `unsure` and `actions`. Jev judges; code decides. State is `{ message }`, the
// scrubbed text. Thresholds are starting values, to calibrate on the 30-message compare set.
import { choice, noul } from '@typesafe-ai/sdk'
import { z } from 'zod'
import { TriageField, type ActionKind, type Triage } from '@shared/schemas'
import type { DateCandidate } from './dates'
import { JEV_QUESTIONS } from './jev-questions'

/** A Noul from here to below NOUL_YES is unsettled: flagged unsure, best guess kept. Below it reads as no. */
export const NOUL_NO_BELOW = 0.3
export const NOUL_YES = 0.7
/** A Choice is unsure when its top probability is below this... */
export const CHOICE_MIN_TOP = 0.6
/** ...or when it leads the runner-up by less than this. */
export const CHOICE_MIN_LEAD = 0.2
/** `questions` is primary from this unclear probability (it is maybe from NOUL_NO_BELOW). */
export const UNCLEAR_PRIMARY = 0.5
/** From this probability the text itself states the urgency. */
export const URGENCY_EXPLICIT = 0.5
/** Sentences and dates offered to Jev per message. */
export const MAX_CANDIDATES = 20
// Probabilities are sums of floats: 0.6 - 0.4 is 0.19999999999999996, which must not count as under 0.2.
const EPS = 1e-9

// Option names go to Jev, so they describe; these maps turn them into the contract's values.
const TYPES = {
  task_request: 'request',
  question: 'question',
  information_only: 'fyi',
  feedback: 'feedback',
  change_announcement: 'change',
  social: 'social'
} as const
const NEEDS_REPLY = {
  reply_needed: 'yes',
  no_reply_needed: 'no',
  confirm_only: 'confirm_only'
} as const
const URGENCY = { today: 'today', this_week: 'this_week', no_rush: 'no_rush' } as const
const TONES = {
  neutral: 'neutral',
  friendly: 'friendly',
  upset: 'upset',
  worried: 'worried'
} as const
const ADDRESSEES = { the_reader: 'me', a_group: 'group', nobody_in_particular: 'nobody' } as const

const FIXED = {
  type: choice('What kind of message is `message`?', {
    task_request: 'Asks the reader to do a piece of work or a favour.',
    question: 'Asks the reader for information, an answer or an opinion.',
    information_only: 'Shares news or an update; nothing is asked of the reader.',
    feedback: 'Comments on how the reader did something, good or bad.',
    change_announcement:
      'Announces that the reader’s project, manager, priorities, tools or schedule is changing.',
    social: 'Greetings, thanks, small talk or a social invitation.'
  }),
  needsReply: choice('What answer does the writer of `message` expect from the reader?', {
    reply_needed:
      'The writer is waiting for information, a decision or an opinion from the reader.',
    confirm_only: 'A short "ok", "got it" or "will do" is enough.',
    no_reply_needed: 'The writer expects no answer, for example a broadcast update or a thank-you.'
  }),
  urgency: choice('How soon does `message` need the reader to act?', {
    today: 'The reader should act today or right now.',
    this_week: 'The reader should act in the next few days.',
    no_rush: 'Nothing to do, or it can wait a week or more.'
  }),
  urgencyExplicit: noul('Does `message` say in words how soon the reader should act?', {
    true: 'The message names a time limit, such as "today", "ASAP", "by Friday" or a date.',
    false: 'The message names no time limit; how soon is left to the reader.'
  }),
  tone: choice('How does the writer of `message` sound?', {
    neutral: 'Matter-of-fact, sharing information without emotion.',
    friendly: 'Warm and relaxed, for example thanks, greetings or encouragement.',
    upset: 'Annoyed, disappointed or angry, for example about a delay or a repeated problem.',
    worried: 'Anxious or stressed, for example about a risk, a deadline or a problem.'
  }),
  isNewTask: noul('Does `message` give the reader a new piece of work to do?', {
    true: 'The message asks the reader to make, fix, send, finish or prepare something.',
    false: 'The message only shares news, asks a quick question, says thanks or chats.'
  }),
  // The same judgments as the decoder's, worded once in jev-questions.ts.
  isChange: JEV_QUESTIONS.isChange,
  changeType: JEV_QUESTIONS.changeType,
  deadlineUnclear: noul('Is the reader left to guess by when `message` wants something done?', {
    true: 'Something is asked with no time, or only a vague one such as "soon" or "when you get a chance".',
    false: 'The message names a clear day or time, or asks nothing of the reader.'
  }),
  whatUnclear: noul('Is the reader left to guess what `message` wants them to do?', {
    true: 'The message hints at a request without saying plainly what to do or how much.',
    false: 'The message says plainly what the reader should do, or asks nothing of them.'
  }),
  whoUnclear: noul('Is the reader left to guess who to work with or ask, given `message`?', {
    true: 'The message mentions working with others or "the team" without saying who.',
    false: 'The message names who is involved, or the work needs no one else.'
  }),
  addressee: choice('Who is `message` written to?', {
    the_reader: 'The reader personally, written as [Me] or as "you" in a one-to-one message.',
    a_group: 'A team, a channel or several people at once.',
    nobody_in_particular: 'No one in particular, such as an automatic notice or a note to self.'
  }),
  // Companion of `deadline`: a Choice always picks something, so this says whether anything fits.
  hasDeadline: noul('Does `message` tie the reader’s work to a day or a time?', {
    true: 'The message says when something is due or when something starts, such as "by Friday", "mañana a las 10" or "starting Monday".',
    false: 'The message names no day or time for the reader’s work, or only past ones.'
  })
}

/**
 * The bundled questions for one message. Candidate texts are the option names, so the pick is a verbatim copy that
 * code can check. Questions over an empty candidate list are left out.
 */
export function triageQuestions(dates: string[], sentences: string[]): Record<string, unknown> {
  const options = (xs: string[]): Record<string, null> =>
    Object.fromEntries(xs.map((x) => [x, null]))
  const s = options(sentences)
  return {
    ...FIXED,
    ...(dates.length && {
      deadline: choice(
        'Which of these is when the reader’s work in `message` is due or starts?',
        options(dates)
      )
    }),
    ...(sentences.length && {
      evidenceDeadline: choice(
        'Which sentence of `message` says when the work is due or starts?',
        s
      ),
      evidenceUrgency: choice(
        'Which sentence of `message` shows best how soon the reader should act?',
        s
      ),
      evidenceTone: choice('Which sentence of `message` shows best how the writer feels?', s),
      evidenceChange: choice('Which sentence of `message` says what is changing for the reader?', s)
    })
  }
}

const prob = z.number().min(0).max(1)
const noulAnswer = z.object({ noul: prob })
const choiceAnswer = (
  labels: readonly string[]
): z.ZodType<{ probabilities: Record<string, number> }> =>
  z.object({ probabilities: z.object(Object.fromEntries(labels.map((l) => [l, prob]))) })
// Evidence picks are checked against the text afterwards, and dropped when they do not match.
const pickAnswer = z.object({ choice: z.string() }).optional()

const unsettled = (p: number): boolean => p >= NOUL_NO_BELOW && p < NOUL_YES
/** The top option (mapped to the contract's value), its probability, and whether the choice is unsure. */
function top<M extends Record<string, string>>(
  probabilities: Record<string, number>,
  map: M
): { value: M[keyof M]; p: number; unsure: boolean } {
  const [[label, p], second] = Object.entries(probabilities).sort((a, b) => b[1] - a[1])
  const lead = p - (second?.[1] ?? 0)
  return {
    value: map[label as keyof M],
    p,
    unsure: p < CHOICE_MIN_TOP - EPS || lead < CHOICE_MIN_LEAD - EPS
  }
}

export type EvidenceField = keyof Triage['evidence']

/**
 * Jev's raw answers to `triageQuestions(dates, sentences)` as Triage fields. Rejects an answer that does not match the
 * questions asked. `picks` are the evidence sentences Jev chose, still to be checked against the text.
 */
export function toTriage(
  raw: unknown,
  dates: DateCandidate[],
  sentences: string[]
): Omit<Triage, 'evidence' | 'senderRole' | 'source'> & {
  picks: Partial<Record<EvidenceField, string>>
} {
  const parsed = z
    .object({
      type: choiceAnswer(Object.keys(TYPES)),
      needsReply: choiceAnswer(Object.keys(NEEDS_REPLY)),
      urgency: choiceAnswer(Object.keys(URGENCY)),
      urgencyExplicit: noulAnswer,
      tone: choiceAnswer(Object.keys(TONES)),
      isNewTask: noulAnswer,
      isChange: noulAnswer,
      changeType: z.object({ choice: z.enum(['project', 'leader', 'priorities', 'other']) }),
      deadlineUnclear: noulAnswer,
      whatUnclear: noulAnswer,
      whoUnclear: noulAnswer,
      addressee: choiceAnswer(Object.keys(ADDRESSEES)),
      hasDeadline: noulAnswer,
      deadline: dates.length ? choiceAnswer(dates.map((d) => d.text)) : z.undefined().optional(),
      ...Object.fromEntries(
        ['evidenceDeadline', 'evidenceUrgency', 'evidenceTone', 'evidenceChange'].map((k) => [
          k,
          sentences.length ? pickAnswer : z.undefined().optional()
        ])
      )
    })
    .safeParse(raw)
  // No Zod detail: it could quote the answer, and Jev's labels are pieces of the message.
  if (!parsed.success) throw new Error('Jev returned an invalid triage answer.')
  const a = parsed.data as typeof parsed.data & Record<string, { choice: string } | undefined>

  const type = top(a.type.probabilities, TYPES)
  const needsReply = top(a.needsReply.probabilities, NEEDS_REPLY)
  const urgency = top(a.urgency.probabilities, URGENCY)
  const tone = top(a.tone.probabilities, TONES)
  const addressee = top(a.addressee.probabilities, ADDRESSEES)
  const pick =
    a.deadline &&
    top(a.deadline.probabilities, Object.fromEntries(dates.map((d) => [d.text, d.text])))
  const found =
    a.hasDeadline.noul >= NOUL_NO_BELOW && pick
      ? dates.find((d) => d.text === pick.value)
      : undefined
  const isNewTask = a.isNewTask.noul
  const isChange = a.isChange.noul
  const whatOrWhoUnclear = Math.max(a.whatUnclear.noul, a.whoUnclear.noul)
  const unclear = Math.max(a.deadlineUnclear.noul, whatOrWhoUnclear)

  const flags: Record<TriageField, boolean> = {
    type: type.unsure,
    needsReply: needsReply.unsure,
    urgency: urgency.unsure,
    deadline: unsettled(a.hasDeadline.noul) || (!!found && !!pick?.unsure),
    tone: tone.unsure,
    change: unsettled(isChange),
    task: unsettled(isNewTask),
    ambiguity: unsettled(a.deadlineUnclear.noul) || unsettled(whatOrWhoUnclear),
    addressee: addressee.unsure
  }
  const strength = (p: number, primary: number): 'primary' | 'maybe' | null =>
    p >= primary ? 'primary' : p >= NOUL_NO_BELOW ? 'maybe' : null
  // Listed in tie order (change, task, questions); the stable sort then puts primary first.
  const offers: [ActionKind, 'primary' | 'maybe' | null][] = [
    ['transition', strength(isChange, NOUL_YES)],
    ['steps', strength(isNewTask, NOUL_YES)],
    ['questions', strength(unclear, UNCLEAR_PRIMARY)]
  ]
  const picks: Partial<Record<EvidenceField, string>> = {
    deadline: found ? a.evidenceDeadline?.choice : undefined,
    urgency: a.evidenceUrgency?.choice,
    tone: a.evidenceTone?.choice,
    change: isChange >= NOUL_NO_BELOW ? a.evidenceChange?.choice : undefined
  }
  return {
    type: { value: type.value, p: type.p },
    needsReply: { value: needsReply.value, p: needsReply.p },
    urgency: {
      value: urgency.value,
      p: urgency.p,
      explicit: a.urgencyExplicit.noul >= URGENCY_EXPLICIT
    },
    deadline: found ? { ...found } : null,
    tone: { value: tone.value, p: tone.p },
    isNewTask,
    isChange,
    changeType: isChange < NOUL_NO_BELOW ? 'none' : a.changeType.choice,
    deadlineUnclear: a.deadlineUnclear.noul,
    whatOrWhoUnclear,
    addressee: { value: addressee.value, p: addressee.p },
    unsure: TriageField.options.filter((f) => flags[f]),
    actions: offers
      .flatMap(([kind, s]) => (s ? [{ kind, strength: s }] : []))
      .sort((x, y) => Number(x.strength === 'maybe') - Number(y.strength === 'maybe')),
    picks
  }
}

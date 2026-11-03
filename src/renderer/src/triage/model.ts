// What the triage bubble says, as pure functions: i18n keys and params in, the component translates.
import type { ActionKind, Triage, UnclearPart } from '@shared/schemas'
import { AMBIGUOUS_AT } from '../decode/model'

/** The bubble at 16px: its card, Pip and the gap between (gap-2). The window is fitted to this. */
export const CARD_WIDTH = 384
export const PIP_SIZE = 44
export const BUBBLE_WIDTH = CARD_WIDTH + PIP_SIZE + 8
/** Room kept for the card while Jev reads (the samples run 200–360px), so the answer fits where Pip already is. */
export const CARD_RESERVE = 480
/** Which way the bubble opens from the cursor: left and/or up when the screen has no room right or below. */
export type Flip = { x: boolean; y: boolean }

type Deadline = NonNullable<Triage['deadline']>

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY_MS = 86_400_000

const startOfDay = (d: Date): number =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** "Due Fri, Nov 6", "Before Mon, Nov 9", "Due today, 5:00 PM": the date in words the person reads at a glance. */
export function formatDue(
  deadline: Deadline,
  now: Date,
  locale: string
): { key: 'bubble.due' | 'bubble.before'; date: string } {
  const key = deadline.explicit ? 'bubble.due' : 'bubble.before'
  const ymd = deadline.date ? DATE_ONLY.exec(deadline.date) : null
  // `new Date('2026-11-06')` is UTC midnight, which is the day before in the Americas.
  const at = ymd ? new Date(+ymd[1], +ymd[2] - 1, +ymd[3]) : new Date(deadline.date ?? NaN)
  if (Number.isNaN(at.getTime())) return { key, date: deadline.text }

  const time = ymd ? {} : ({ hour: 'numeric', minute: '2-digit' } as const)
  const days = Math.round((startOfDay(at) - startOfDay(now)) / DAY_MS)
  if (days === 0 || days === 1) {
    const word = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(days, 'day')
    if (ymd) return { key, date: word }
    return { key, date: `${word}, ${new Intl.DateTimeFormat(locale, time).format(at)}` }
  }
  const date = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...time
  }).format(at)
  return { key, date }
}

/** The parts of the message the "Ask, don't guess" button can ask about. */
export function unclearParts(triage: Triage): UnclearPart[] {
  const parts: UnclearPart[] = []
  if (triage.deadlineUnclear >= AMBIGUOUS_AT || triage.unsure.includes('deadline')) {
    parts.push('deadline')
  }
  if (triage.whatOrWhoUnclear >= AMBIGUOUS_AT) parts.push('what_or_who')
  return parts
}

export interface TriageLines {
  /** Sender role from the profile, or null. */
  from: string | null
  /** The date, or the urgency when there is no deadline. `evidence` is the tooltip; `mark` is "worth asking". */
  when: {
    icon: 'date' | 'urgency'
    key: string
    params?: { date: string }
    evidence?: string
    mark: boolean
  }
  reply: string
  tone: { tone: Triage['tone']['value']; key: string; quote?: string }
  addressee: string | null
  /** The "About: …" line of the ask button, or null. */
  about: string | null
  /** Each action with the small label above its button: `typeKey` fills `{{type}}`. */
  actions: (Triage['actions'][number] & { eyebrow?: { key: string; typeKey?: string } })[]
}

function eyebrowFor(
  kind: ActionKind,
  changeType: Triage['changeType']
): { key: string; typeKey?: string } | undefined {
  if (kind === 'questions') return { key: 'bubble.eyebrow.questions' }
  if (kind !== 'transition') return undefined
  return changeType === 'none'
    ? { key: 'bubble.eyebrow.transitionAny' }
    : { key: 'bubble.eyebrow.transition', typeKey: `decode.changeTypes.${changeType}` }
}

export function triageLines(triage: Triage, now: Date, locale: string): TriageLines {
  const unsure = (field: Triage['unsure'][number]): boolean => triage.unsure.includes(field)
  const parts = unclearParts(triage)
  const asks = triage.actions.some((a) => a.kind === 'questions')
  const { evidence } = triage

  const when = triage.deadline
    ? {
        icon: 'date' as const,
        ...formatDue(triage.deadline, now, locale),
        evidence: evidence.deadline
      }
    : {
        icon: 'urgency' as const,
        key: `bubble.urgency${unsure('urgency') ? 'Maybe' : ''}.${triage.urgency.value}`,
        evidence: evidence.urgency
      }
  const toneQuote = triage.tone.value === 'neutral' ? undefined : evidence.tone

  return {
    from: triage.senderRole,
    when: {
      icon: when.icon,
      key: when.key,
      ...('date' in when && { params: { date: when.date } }),
      evidence: when.evidence || undefined,
      mark: asks && parts.includes('deadline')
    },
    reply: `bubble.reply${unsure('needsReply') ? 'Maybe' : ''}.${triage.needsReply.value}`,
    tone: {
      tone: triage.tone.value,
      key: `bubble.tone.${triage.tone.value}`,
      quote: toneQuote || undefined
    },
    addressee:
      triage.addressee.value === 'me' ? null : `bubble.addressee.${triage.addressee.value}`,
    about:
      !asks || parts.length === 0 ? null : `bubble.about.${parts.length === 2 ? 'both' : parts[0]}`,
    actions: triage.actions.map((a) => ({ ...a, eyebrow: eyebrowFor(a.kind, triage.changeType) }))
  }
}

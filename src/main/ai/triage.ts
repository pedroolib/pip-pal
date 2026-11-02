// The triage pipeline, on the hotkey: scrub → candidates in code → one bundled Jev request → fields decided in code.
// No Claude, and no fallback: if Jev fails the triage fails. The client is injected (see clients.ts for the real one).
import { scrubForModel } from '@shared/profile'
import { Triage, type Profile } from '@shared/schemas'
import { findDateCandidates } from './dates'
import { JEV_TIMEOUT_MS, MAX_CHARS } from './decoder'
import { MAX_CANDIDATES, toTriage, triageQuestions, type EvidenceField } from './triage-questions'

/** Only scrubbed text ever reaches it. Resolves to Jev's raw `answers`; triage validates them. */
export interface TriageJevClient {
  ask(req: { state: { message: string }; questions: Record<string, unknown> }): Promise<unknown>
}

export type TriageFn = (text: string, profile: Profile) => Promise<Triage>

export function createTriager({
  jev,
  now = () => new Date()
}: {
  jev: TriageJevClient
  now?: () => Date
}): TriageFn {
  return async (text, profile) => {
    // Arrives over IPC, so checked at runtime too.
    if (typeof text !== 'string' || !text.trim())
      throw new Error('Nothing to triage: the selected text is empty.')
    if (text.length > MAX_CHARS)
      throw new Error(`The selected text is too long to triage (over ${MAX_CHARS} characters).`)
    const scrubbed = scrubForModel(text, profile)
    // NFKC can expand one character up to 18x; the 2x margin leaves room for [Role] tokens.
    if (scrubbed.text.length > 2 * MAX_CHARS)
      throw new Error(`The selected text is too long to triage (over ${MAX_CHARS} characters).`)

    // Candidates come from the scrubbed text only, so no name can reach Jev through them.
    // shortcut: only the first MAX_CANDIDATES dates and sentences are offered; a later deadline or evidence is missed in very long messages.
    const dates = findDateCandidates(scrubbed.text, now()).slice(0, MAX_CANDIDATES)
    const sentences = splitSentences(scrubbed.text).slice(0, MAX_CANDIDATES)
    const raw = await askWithTimeout(jev, {
      state: { message: scrubbed.text },
      questions: triageQuestions(
        dates.map((d) => d.text),
        sentences
      )
    })
    const { picks, ...fields } = toTriage(raw, dates, sentences)

    const evidence: Triage['evidence'] = {}
    for (const [field, quote] of Object.entries(picks) as [EvidenceField, string | undefined][]) {
      // Only a verbatim piece of the message counts as evidence.
      if (quote?.trim() && scrubbed.text.includes(quote)) evidence[field] = scrubbed.restore(quote)
    }
    return Triage.parse({
      ...fields,
      deadline: fields.deadline && {
        ...fields.deadline,
        text: scrubbed.restore(fields.deadline.text)
      },
      evidence,
      senderRole: senderRole(scrubbed.text, scrubbed.restore, profile),
      source: 'jev'
    })
  }
}

async function askWithTimeout(
  jev: TriageJevClient,
  req: Parameters<TriageJevClient['ask']>[0]
): Promise<unknown> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('Jev did not answer the triage in time.')),
      JEV_TIMEOUT_MS
    )
  })
  const answer = Promise.resolve()
    .then(() => jev.ask(req))
    .catch(() => {
      // The client's error may carry the request; this one names no part of the message.
      throw new Error('Jev could not triage the message.')
    })
  try {
    return await Promise.race([answer, timeout])
  } finally {
    clearTimeout(timer)
  }
}

/** Sentences and lines, trimmed, in order, one per distinct text; only those with a letter or digit. */
export function splitSentences(text: string): string[] {
  const parts = text
    .split(/\n+/)
    .flatMap((line) =>
      typeof Intl.Segmenter === 'function'
        ? [...new Intl.Segmenter(undefined, { granularity: 'sentence' }).segment(line)].map(
            (s) => s.segment
          )
        : line.split(/(?<=[.!?])\s+/)
    )
  return [...new Set(parts.map((s) => s.trim()).filter((s) => /[\p{L}\p{N}]/u.test(s)))]
}

// A role token as the scrubber writes it, e.g. [Manager] or [Manager 2].
const TOKEN = '(\\[[^\\]\\n]+\\])'
const LEADING = new RegExp(`^\\s*(?:(?:from|de)\\s*:\\s*${TOKEN}|${TOKEN}\\s*:)`, 'iu')
const TRAILING = new RegExp(
  `(?:[—–]|(?:^|\\s)-|(?:^|[\\s.!?])(?:thanks|thank you|thx|cheers|best|regards|gracias|saludos|un saludo)\\s*,?)\\s*${TOKEN}\\s*[.!]?\\s*$`,
  'iu'
)

/**
 * The profile role of the person the selection names as its sender, else null. Read on the scrubbed text, so the
 * scrubber's name matching (case, accents, first names) decides who a name is.
 * shortcut: only a leading "Name:" / "From: Name" or a trailing "— Name" / "Thanks, Name" counts; email headers,
 * chat-app layouts and nicknames not in the profile are not read, add them when a real selection shows one.
 */
function senderRole(
  scrubbed: string,
  restore: (s: string) => string,
  profile: Profile
): string | null {
  const m = LEADING.exec(scrubbed) ?? TRAILING.exec(scrubbed)
  const token = m && (m[1] ?? m[2])
  if (!token) return null
  const name = restore(token)
  return profile.people.find((p) => p.name.trim() === name)?.role ?? null
}

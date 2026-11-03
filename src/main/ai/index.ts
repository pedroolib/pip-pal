// Glue for the triage, expand, summary and onboarding IPC handlers: validates what the untrusted renderer sends, then picks the
// real pipeline (its key is set) or the fixture. Free of electron so it can be tested; mock.ts passes the real parts in.
import { ActionKind, Recipient, SummaryPeriod, UnclearPart, type Profile } from '@shared/schemas'
import type { PipApi } from '@shared/ipc'
import type { NewEvent } from '../event-store'
import { MAX_CHARS } from './decoder'
import type { Expand } from './expand'
import type { DraftProfile } from './onboarding'
import type { Summarize, SummaryData } from './summary'
import type { TriageFn } from './triage'

type Env = Record<string, string | undefined>
type Handlers = Pick<PipApi, 'triage' | 'expand' | 'generateSummary' | 'draftProfile'>

const UnclearHints = UnclearPart.array()
  .max(UnclearPart.options.length)
  .refine((parts) => new Set(parts).size === parts.length)

// Messages never include the input: the renderer is untrusted and the text is the person's.
function checkText(text: unknown): asserts text is string {
  if (typeof text !== 'string' || !text.trim()) throw new Error('The selected text is empty.')
  if (text.length > MAX_CHARS)
    throw new Error(`The selected text is too long (over ${MAX_CHARS} characters).`)
}

// One running call per key: the same input joins the running call, a different input is refused.
function oneAtATime<T>(
  running: Map<string, { input: string; promise: Promise<T> }>,
  key: string,
  input: string,
  start: () => Promise<T>
): Promise<T> {
  const current = running.get(key)
  if (current) {
    if (current.input === input) return current.promise
    return Promise.reject(new Error('Pip is still working on another text. Try again in a moment.'))
  }
  const promise = start().finally(() => running.delete(key))
  running.set(key, { input, promise })
  return promise
}

export function createAiHandlers({
  env,
  api,
  load,
  save,
  makeTriager,
  makeExpander,
  makeSummarizer,
  makeDrafter,
  summaryData,
  logEvent,
  log = console.log
}: {
  env: Env
  api: Handlers
  /** The live profile, read on every call. */
  load: () => Profile
  save: (profile: Profile) => void
  makeTriager: () => TriageFn
  makeExpander: () => Expand
  makeSummarizer: () => Summarize
  makeDrafter: () => DraftProfile
  /** The live check-ins, events and achievements, read on every summary. */
  summaryData: () => SummaryData
  /** Appends to the usage log (main's own kinds included). */
  logEvent: (e: NewEvent) => void
  log?: (line: string) => void
}): Handlers {
  const triager = env.TYPESAFE_API_KEY ? makeTriager() : null
  const expander = env.ANTHROPIC_API_KEY ? makeExpander() : null
  const summarizer = env.ANTHROPIC_API_KEY ? makeSummarizer() : null
  const drafter = env.ANTHROPIC_API_KEY ? makeDrafter() : null
  if (!triager) log('TYPESAFE_API_KEY not set: triage uses the demo fixture.')
  if (!expander) log('ANTHROPIC_API_KEY not set: expand uses the demo fixtures.')
  if (!summarizer) log('ANTHROPIC_API_KEY not set: summary uses the demo fixture.')
  if (!drafter)
    log('ANTHROPIC_API_KEY not set: onboarding keeps the answers as the person wrote them.')

  // The log is a side note: losing one event beats failing the person's call.
  const record = (make: () => NewEvent): void => {
    try {
      logEvent(make())
    } catch {
      log('Could not write the usage log.')
    }
  }

  const triaging = new Map<string, { input: string; promise: ReturnType<PipApi['triage']> }>()
  const expanding = new Map<string, { input: string; promise: ReturnType<PipApi['expand']> }>()
  const drafting = new Map<string, { input: string; promise: ReturnType<PipApi['draftProfile']> }>()

  return {
    async triage(text) {
      checkText(text)
      return oneAtATime(triaging, 'triage', text, async () => {
        const t = await (triager ? triager(text, load()) : api.triage(text))
        record(() => ({
          kind: 'decoded',
          text,
          isChange: t.isChange,
          changeType: t.changeType,
          isNewTask: t.isNewTask,
          tone: t.tone.value
        }))
        return t
      })
    },
    async expand(text, kind, spoons, unclear) {
      checkText(text)
      if (!ActionKind.safeParse(kind).success) throw new Error('Unknown action kind.')
      if (spoons !== null && !(Number.isInteger(spoons) && spoons >= 1 && spoons <= 5))
        throw new Error('Spoons must be null or a whole number from 1 to 5.')
      if (unclear !== undefined && !UnclearHints.safeParse(unclear).success)
        throw new Error('Unclear hints must be a list of distinct parts: deadline, what_or_who.')
      const hints = [...(unclear ?? [])].sort().join(',')
      return oneAtATime(expanding, kind, `${spoons}:${hints}:${text}`, async () => {
        const e = await (expander
          ? expander(text, kind, spoons, load(), unclear)
          : api.expand(text, kind, spoons, unclear))
        record(() => ({ kind: 'action', action: kind }))
        return e
      })
    },
    async generateSummary(recipient, period) {
      if (!Recipient.safeParse(recipient).success) throw new Error('Unknown recipient.')
      if (!SummaryPeriod.safeParse(period).success) throw new Error('Unknown summary period.')
      return summarizer
        ? summarizer(recipient, period, load(), summaryData())
        : api.generateSummary(recipient, period)
    },
    async draftProfile(answers) {
      // Never the fixture: a real person must not get suggestions written for Sam.
      if (!drafter) throw new Error('Pip cannot reach the model right now.')
      return oneAtATime(drafting, 'draft', JSON.stringify(answers), async () => {
        const drafted = await drafter(answers, load())
        // Re-read after the call: the person may have saved the profile meanwhile. Only `pending` grows.
        const profile = load()
        const next = { ...profile, pending: [...(profile.pending ?? []), ...drafted] }
        save(next)
        return next
      })
    }
  }
}

// Glue for the triage and expand IPC handlers: validates what the untrusted renderer sends, then picks the real
// pipeline (its key is set) or the fixture. Free of electron so it can be tested; mock.ts passes the real parts in.
import { ActionKind, UnclearPart, type Profile } from '@shared/schemas'
import type { PipApi } from '@shared/ipc'
import { MAX_CHARS } from './decoder'
import type { Expand } from './expand'
import type { TriageFn } from './triage'

type Env = Record<string, string | undefined>

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
  makeTriager,
  makeExpander,
  log = console.log
}: {
  env: Env
  api: Pick<PipApi, 'triage' | 'expand'>
  /** The live profile, read on every call. */
  load: () => Profile
  makeTriager: () => TriageFn
  makeExpander: () => Expand
  log?: (line: string) => void
}): Pick<PipApi, 'triage' | 'expand'> {
  const triager = env.TYPESAFE_API_KEY ? makeTriager() : null
  const expander = env.ANTHROPIC_API_KEY ? makeExpander() : null
  if (!triager) log('TYPESAFE_API_KEY not set: triage uses the demo fixture.')
  if (!expander) log('ANTHROPIC_API_KEY not set: expand uses the demo fixtures.')

  const triaging = new Map<string, { input: string; promise: ReturnType<PipApi['triage']> }>()
  const expanding = new Map<string, { input: string; promise: ReturnType<PipApi['expand']> }>()

  return {
    async triage(text) {
      checkText(text)
      return oneAtATime(triaging, 'triage', text, async () =>
        triager ? triager(text, load()) : api.triage(text)
      )
    },
    async expand(text, kind, spoons, unclear) {
      checkText(text)
      if (!ActionKind.safeParse(kind).success) throw new Error('Unknown action kind.')
      if (spoons !== null && !(Number.isInteger(spoons) && spoons >= 1 && spoons <= 5))
        throw new Error('Spoons must be null or a whole number from 1 to 5.')
      if (unclear !== undefined && !UnclearHints.safeParse(unclear).success)
        throw new Error('Unclear hints must be a list of distinct parts: deadline, what_or_who.')
      const hints = [...(unclear ?? [])].sort().join(',')
      return oneAtATime(expanding, kind, `${spoons}:${hints}:${text}`, async () =>
        expander
          ? expander(text, kind, spoons, load(), unclear)
          : api.expand(text, kind, spoons, unclear)
      )
    }
  }
}

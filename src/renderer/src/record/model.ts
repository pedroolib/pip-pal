// Pure pieces of the recording flow: the pill's clock, what the review card sends, and which calm
// card a failed transcription gets.

/** Triage reads at most this many characters; keep in step with MAX_CHARS in src/main/ai/decoder.ts. */
export const MAX_READ = 8000

/** Elapsed time as mm:ss. */
export function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`
}

/** What "Read this with Pip" sends: the selected part, or all of it when nothing is selected. */
export function toRead(text: string, start: number, end: number): string {
  return end > start ? text.slice(start, end) : text
}

export type Failure = 'empty' | 'noModel' | 'error'

// IPC wraps main's error ("Error invoking remote method …: Error: <message>"), so match the end.
export function failureOf(e: unknown): Failure {
  const message = e instanceof Error ? e.message : ''
  if (message.includes("I didn't hear any words.")) return 'empty'
  if (message.includes("The speech model isn't installed.")) return 'noModel'
  return 'error'
}

/** A focused button handles its own Enter; a Radix radio is a button too but leaves Enter to the card. */
export function ownsEnter(target: EventTarget | null): boolean {
  const el = target as Element | null
  return el?.tagName === 'BUTTON' && el.getAttribute('role') !== 'radio'
}

/** getDisplayMedia refused (no permission) or could not read the computer audio. */
export function isCantHear(e: unknown): boolean {
  return e instanceof Error && (e.name === 'NotAllowedError' || e.name === 'NotReadableError')
}

/** Puts dictated `text` after the selection in `value`, spaced from its neighbours and cut to `max`. */
export function insertAt(
  value: string,
  text: string,
  end: number,
  max = Infinity
): { value: string; caret: number } {
  const before = value.slice(0, end)
  const after = value.slice(end)
  const lead = before && !/\s$/.test(before) ? ' ' : ''
  const tail = after && !/^\s/.test(after) ? ' ' : ''
  const room = Math.max(0, max - value.length - lead.length - tail.length)
  const add = text.trim().slice(0, room)
  if (!add) return { value, caret: end }
  const next = before + lead + add + tail + after
  return { value: next, caret: before.length + lead.length + add.length }
}

export type DictateFailure = Failure | 'denied' | 'noMic'

/** Why a dictation could not start or finish, for the calm line under the field. */
export function dictateFailure(e: unknown): DictateFailure {
  const name = e instanceof Error ? e.name : ''
  if (name === 'NotAllowedError') return 'denied'
  if (name === 'NotFoundError' || name === 'NotReadableError') return 'noMic'
  return failureOf(e)
}

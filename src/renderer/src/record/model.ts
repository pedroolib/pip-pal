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

// Finds keyboard shortcuts in a step ("press Ctrl + V") so the card can show them as key caps.
// The model's text stays plain text: this only splits it, nothing is parsed as HTML.

const MODIFIER = String.raw`(?:Ctrl|Control|Cmd|Command|Alt|Option|Shift)`
const KEY = String.raw`(?:${MODIFIER}|Enter|Return|Tab|Esc|Space|Delete|Backspace|F\d{1,2}|[A-Za-z0-9])`
const SHORTCUT = new RegExp(String.raw`(?<![\w+])${MODIFIER}(?:\s*\+\s*${KEY})+(?![\w+])`, 'g')

export type Piece = { text: string } | { keys: string[] }

/** Splits text into plain runs and shortcuts; single letters are shown upper case ("Ctrl + V"). */
export function splitKeys(text: string): Piece[] {
  const pieces: Piece[] = []
  let at = 0
  for (const m of text.matchAll(SHORTCUT)) {
    if (m.index > at) pieces.push({ text: text.slice(at, m.index) })
    const keys = m[0].split('+').map((k) => k.trim())
    pieces.push({ keys: keys.map((k) => (k.length === 1 ? k.toUpperCase() : k)) })
    at = m.index + m[0].length
  }
  if (at < text.length) pieces.push({ text: text.slice(at) })
  return pieces
}

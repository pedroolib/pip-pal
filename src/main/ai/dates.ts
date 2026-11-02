// Deadline candidates for triage. Code finds every date or time the (scrubbed) text names and resolves it against
// `now`; Jev only picks which one is the deadline. Weeks start on Monday. Dates use the process's local timezone.
// shortcut: not read: durations ("in 2 days", "en dos semanas"), "next week" / "la semana que viene", "end of week/month",
// ranges ("Mon–Wed"), ordinal words ("the fifth"), quarters ("Q1"), and US month/day order ("11/5" reads 11 May);
// add a rule when the 30-message compare set shows one.

export interface DateCandidate {
  /** The words as written in the text; also the option Jev picks from. */
  text: string
  /** `YYYY-MM-DD`, or `YYYY-MM-DDTHH:mm` when a time is named (local time). */
  date: string
  /** False when the text names it as a start ("starting Monday"): a deadline from it is only inferred. */
  explicit: boolean
}

type Day = { y: number; m: number; d: number } // m is 1–12
// A date part (`day`), a clock part (`clock`, with `time` unless it is end of day), or both (ISO date-time).
type Part = { day?: (now: Date) => Day | null; time?: string; clock?: true }
type Token = Part & { start: number; end: number }

const MONTHS: Record<string, number> = {}
for (const [n, names] of [
  [1, 'january jan enero ene'],
  [2, 'february feb febrero'],
  [3, 'march mar marzo'],
  [4, 'april apr abril abr'],
  [5, 'may mayo'],
  [6, 'june jun junio'],
  [7, 'july jul julio'],
  [8, 'august aug agosto ago'],
  [9, 'september sept sep septiembre setiembre'],
  [10, 'october oct octubre'],
  [11, 'november nov noviembre'],
  [12, 'december dec diciembre dic']
] as const) {
  for (const name of names.split(' ')) MONTHS[name] = n
}
// Index 0 is Monday.
const WEEKDAYS = [
  'monday mon lunes',
  'tuesday tue tues martes',
  'wednesday wed miércoles miercoles',
  'thursday thu thurs jueves',
  'friday fri viernes',
  'saturday sat sábado sabado',
  'sunday sun domingo'
].map((w) => w.split(' '))

const B = '(?<![\\p{L}\\p{N}])'
const E = '(?![\\p{L}\\p{N}])'
const alt = (words: string[]): string => [...words].sort((a, b) => b.length - a.length).join('|')
const MONTH = `(${alt(Object.keys(MONTHS))})\\.?`
const WEEKDAY = `(${alt(WEEKDAYS.flat())})`
const ORD = '(?:st|nd|rd|th|º)?'

const pad = (n: number): string => String(n).padStart(2, '0')
const dayOf = (t: Date): Day => ({ y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() })
const plusDays = (now: Date, n: number): Day =>
  dayOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() + n))
const valid = ({ y, m, d }: Day): boolean => {
  const t = new Date(y, m - 1, d)
  return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d
}
/** A calendar date; with no year, the next one on or after today. */
const calendar = (m: number, d: number, year?: string) => (now: Date) => {
  const y = year ? Number(year.length === 2 ? `20${year}` : year) : now.getFullYear()
  const day = { y, m, d }
  if (!valid(day)) return null
  const past = new Date(y, m - 1, d) < new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return !year && past ? { ...day, y: y + 1 } : day
}
/** A clock part, or null for an impossible time. */
const clock = (h: number, min = 0): Part | null =>
  h >= 0 && h <= 23 && min >= 0 && min <= 59 ? { clock: true, time: `${pad(h)}:${pad(min)}` } : null

const RULES: [RegExp, (m: RegExpExecArray) => Part | null][] = [
  // ISO date, optionally with a time: 2026-11-05, 2026-11-05 14:30, 2026-11-05T14:30
  [
    /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2}))?(?!\d)/g,
    (m) => {
      const time = m[4] ? clock(Number(m[4]), Number(m[5])) : {}
      return time && { day: calendar(Number(m[2]), Number(m[3]), m[1]), time: time.time }
    }
  ],
  // 5 November, 5th Nov 2026, 5 de noviembre (de 2026)
  [
    new RegExp(
      `${B}(\\d{1,2})${ORD}(?:\\s+de)?\\s+${MONTH}(?:,?\\s+(?:de\\s+)?(\\d{4}))?${E}`,
      'giu'
    ),
    (m) => ({ day: calendar(MONTHS[m[2].toLowerCase()], Number(m[1]), m[3]) })
  ],
  // November 5, Nov 5th, 2026
  [
    new RegExp(`${B}${MONTH}\\s+(\\d{1,2})${ORD}(?:,?\\s+(\\d{4}))?${E}`, 'giu'),
    (m) => ({ day: calendar(MONTHS[m[1].toLowerCase()], Number(m[2]), m[3]) })
  ],
  // Day/month(/year), read day first
  [
    /(?<![\d/])(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?(?![\d/])/g,
    (m) => ({ day: calendar(Number(m[2]), Number(m[1]), m[3]) })
  ],
  // Weekdays: a bare one is the next after today (said on a Monday, "Monday" is next week's; today is "today");
  // "this" is this week's, "next" the following week's.
  [
    new RegExp(
      `${B}(?:(this|next|este|esta|el\\s+pr[óo]ximo|pr[óo]ximo|el)\\s+)?${WEEKDAY}(\\s+que\\s+viene|\\s+next\\s+week)?${E}`,
      'giu'
    ),
    (m) => {
      const w = WEEKDAYS.findIndex((names) => names.includes(m[2].toLowerCase()))
      const q = (m[1] ?? '').toLowerCase()
      const week = m[3] || /next|pr[óo]ximo/.test(q) ? 'next' : /this|est/.test(q) ? 'current' : ''
      return {
        day: (now) => {
          const today = (now.getDay() + 6) % 7
          if (week === 'next') return plusDays(now, 7 - today + w)
          if (week === 'current') return plusDays(now, w - today)
          return plusDays(now, (w - today + 7) % 7 || 7)
        }
      }
    }
  ],
  // "la mañana" / "esta mañana" is the morning, not tomorrow.
  [
    new RegExp(
      `${B}(the\\s+day\\s+after\\s+tomorrow|day\\s+after\\s+tomorrow|pasado\\s+ma[ñn]ana|tomorrow|today|tonight|hoy|esta\\s+noche|(?<!(?:la|esta)\\s+)ma[ñn]ana)${E}`,
      'giu'
    ),
    (m) => {
      const w = m[1].toLowerCase()
      const n = /after|pasado/.test(w) ? 2 : /tomorrow|ma[ñn]ana/.test(w) ? 1 : 0
      return { day: (now) => plusDays(now, n) }
    }
  ],
  // End of day: a date with no clock time ("EOD Friday" is Friday).
  [
    new RegExp(
      `${B}(?:EOD|COB|end\\s+of\\s+(?:the\\s+)?(?:business\\s+)?day|close\\s+of\\s+business|(?:al\\s+)?(?:fin|final)\\s+del\\s+d[íi]a)${E}`,
      'giu'
    ),
    () => ({ clock: true })
  ],
  // 10am, 3:30 pm, 10 a.m.
  [
    new RegExp(`${B}(\\d{1,2})(?::([0-5]\\d))?\\s*([ap])\\.?\\s*m\\.?(?!\\p{L})`, 'giu'),
    (m) => {
      const h = Number(m[1])
      const pm = m[3].toLowerCase() === 'p'
      return h >= 1 && h <= 12 ? clock((h % 12) + (pm ? 12 : 0), Number(m[2] ?? 0)) : null
    }
  ],
  // 14:30
  [new RegExp(`${B}(\\d{1,2}):(\\d{2})${E}`, 'gu'), (m) => clock(Number(m[1]), Number(m[2]))],
  // at 10, a las 5 (de la tarde)
  [
    new RegExp(
      `${B}(?:at|a\\s+las?)\\s+(\\d{1,2})(?::(\\d{2}))?(?:\\s+de\\s+la\\s+(ma[ñn]ana|tarde|noche))?${E}`,
      'giu'
    ),
    (m) => {
      const h = Number(m[1])
      const later = m[3] && !/ma/i.test(m[3]) && h < 12
      return clock(later ? h + 12 : h, Number(m[2] ?? 0))
    }
  ],
  [new RegExp(`${B}(?:noon|midday|mediod[íi]a)${E}`, 'giu'), () => clock(12)]
]

// Words before a date that make it a start date.
const STARTS =
  /(?:starting|starts|start|from|beginning|as\s+of|effective|a\s+partir\s+del?|desde|empezando|comenzando)(?:\s+(?:on|el))?\s+$/iu
// A date and a time this close, with no sentence break between them, are one moment ("mañana a las 10", "3pm tomorrow").
const JOIN = /^[^.!?;\n]{0,12}$/

/** Every date or time the text names, in order, one per distinct wording, resolved against `now`. */
export function findDateCandidates(text: string, now: Date): DateCandidate[] {
  const found: Token[] = []
  for (const [re, read] of RULES) {
    for (const m of text.matchAll(re)) {
      const part = read(m)
      if (part) found.push({ ...part, start: m.index, end: m.index + m[0].length })
    }
  }
  // Earliest first, longest first; drop tokens inside one already kept.
  found.sort((a, b) => a.start - b.start || b.end - a.end)
  const tokens: Token[] = []
  for (const t of found)
    if (!tokens.length || t.start >= tokens[tokens.length - 1].end) tokens.push(t)

  const out = new Map<string, DateCandidate>()
  for (let i = 0; i < tokens.length; i++) {
    let t = tokens[i]
    const next = tokens[i + 1]
    const dateOnly = (x: Token): boolean => !!x.day && !x.clock && !x.time
    const pair = next && ((dateOnly(t) && next.clock) || (t.clock && dateOnly(next)))
    if (pair && JOIN.test(text.slice(t.end, next.start))) {
      t = { start: t.start, end: next.end, day: t.day ?? next.day, time: t.time ?? next.time }
      i++
    }
    // A time on its own is today.
    const day = t.day ? t.day(now) : dayOf(now)
    if (!day) continue
    const words = text.slice(t.start, t.end)
    if (out.has(words)) continue
    out.set(words, {
      text: words,
      date: `${day.y}-${pad(day.m)}-${pad(day.d)}${t.time ? `T${t.time}` : ''}`,
      explicit: !STARTS.test(text.slice(Math.max(0, t.start - 40), t.start))
    })
  }
  return [...out.values()]
}

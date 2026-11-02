// Pure profile helpers shared by main, renderer and the AI side.
import { SECTIONS, type Decoded, type Profile, type ProfileEntry, type Recipient } from './schemas'

type WithId = { id?: string }
const withId = <T extends WithId>(x: T): T => (x.id ? x : { ...x, id: crypto.randomUUID() })

/** Fills missing entry/strategy ids. Existing ids are kept, so it is idempotent. */
export function ensureIds(profile: Profile): Profile {
  const sections = mapSections(profile, (entries) => entries.map(withId))
  return { ...profile, sections, calmingStrategies: profile.calmingStrategies.map(withId) }
}

// `sections` is a full record, so "dropping" a section means emptying it.
function mapSections(
  profile: Profile,
  fn: (entries: ProfileEntry[]) => ProfileEntry[]
): Profile['sections'] {
  return Object.fromEntries(
    SECTIONS.map((s) => [s, fn(profile.sections[s] ?? [])])
  ) as Profile['sections']
}

/**
 * The profile reduced to what `recipient` may see. An empty `visibleTo` means private.
 * People (names) and pending suggestions never leave the owner.
 */
export function forRecipient(profile: Profile, recipient: Recipient): Profile {
  const visible = <T extends { visibleTo: Recipient[] }>(x: T): boolean =>
    x.visibleTo.includes(recipient)
  const sections = mapSections(profile, (entries) => entries.filter(visible))
  return {
    name: profile.name,
    role: profile.role,
    people: [],
    sections,
    calmingStrategies: profile.calmingStrategies.filter(visible)
  }
}

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu
// @mentions, minus trailing punctuation; a letter or "_" first, so "@10am" stays a time.
const HANDLE = /(?<![\p{L}\p{N}])@[\p{L}_](?:[\p{L}\p{N}._-]*[\p{L}\p{N}])?/gu
const TAIL = `[^\\s<>"]*[^\\s<>".,;:!?)\\]']` // a URL tail never ends on sentence punctuation
// shortcut: a bare domain (no scheme, no www.) is only caught for the TLDs listed here, so "startup.xyz" passes; widen the list when a real case shows up.
const URL_RE = new RegExp(
  `\\b(?:(?:https?|ftp)://|www\\.)${TAIL}|(?<![\\w.@-])(?:[a-z0-9-]+\\.)+(?:com|org|net|io|co|edu|gov|app|dev|ai|me|info|mx|es|uk|de|fr)\\b(?:[/?#]${TAIL})?`,
  'giu'
)
// shortcut: any run of 7+ digits split by spaces/dashes reads as a phone ("tasks 10 20 30 40" too); safe for privacy but may drop meaning, tighten if decodes suffer.
// An ISO date is matched first and kept, so "2026-11-01 10:30" is never read as a phone.
// shortcut: a phone written exactly like a valid date ("5551-12-25 67") keeps its date-shaped part; tighten if one shows up.
const PHONE =
  /(?<![\d+])(\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])(?!\d))|(?<![\d+])\+?\(?\d[\d\s().-]{5,}\d(?!\w)/g

// NFKC turns fullwidth letters into plain ones; format characters (zero-width, soft hyphen) hide names.
// A lone ´ is typed as an apostrophe, and NFKC would split it into a space plus an accent.
// shortcut: NFKC also rewrites the text Claude sees ("½" -> "1⁄2", "x²" -> "x2", "℃" -> "°C"); apply it only for matching if decodes suffer.
// shortcut: Cyrillic look-alikes ("Dаna" with U+0430) are not folded to Latin; add a small skeleton map if one shows up.
const normalize = (s: string): string =>
  s
    .replace(/´/g, "'")
    .normalize('NFKC')
    .replace(/\p{Cf}/gu, '')

/** Normalized text with emails, handles, links and phone numbers removed. Emails first: they may sit inside URLs. */
function stripContacts(text: string): string {
  return normalize(text)
    .replace(EMAIL, () => '[email]')
    .replace(HANDLE, () => '[handle]')
    .replace(URL_RE, () => '[link]')
    .replace(PHONE, (m, date) => (date || m.replace(/\D/g, '').length < 7 ? m : '[phone]'))
}

// Case, accents, apostrophes, hyphens and spacing folded, so "JOSE", "O’Brien" / "O'Brien", "Dana-Lee" / "Dana Lee","José" and "José" share one key.
const APOSTROPHES = "'’‘ʼ`"
const HYPHENS = '\\s‐‑-' // whitespace, U+2010, U+2011, hyphen-minus
// shortcut: ł/ø/ı/ß/æ have no NFD base letter, so "Łukasz" does not match "Lukasz"; add a small fold map when a user needs it.
const fold = (s: string): string =>
  normalize(s)
    .normalize('NFD')
    .replace(
      /(?<=[\p{sc=Latin}\p{sc=Greek}\p{sc=Cyrillic}\p{sc=Arabic}\p{sc=Hebrew}]\p{M}*)\p{M}/gu,
      ''
    ) // only these scripts fold marks; Thai, Devanagari, kana marks are part of the letter
    .normalize('NFC')
    .toLowerCase()
    .replace(new RegExp(`[${APOSTROPHES}]`, 'g'), "'")
    .replace(new RegExp(`[${HYPHENS}]+`, 'g'), ' ')
    .trim()
const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// Latin base letter -> itself plus its accented forms (Latin-1 to Extended-B, and Extended Additional for "ễ", "Ḥ"),
// so a name matches with or without accents.
const VARIANTS = new Map<string, string>()
for (const [lo, hi] of [
  [0xc0, 0x24f],
  [0x1e00, 0x1eff],
  [0x370, 0x4ff],
  [0x620, 0x6d3],
  [0x1f00, 0x1fff]
]) {
  for (let cp = lo; cp <= hi; cp++) {
    const ch = String.fromCodePoint(cp)
    const base = fold(ch)
    if (base.length === 1 && /\p{L}/u.test(base) && base !== ch.toLowerCase()) {
      VARIANTS.set(base, (VARIANTS.get(base) ?? base) + ch)
    }
  }
}
// Each letter may carry combining marks NFKC leaves loose ("Olsen" + U+034F, "Dana" + U+0332).
// The combining blocks, variation selectors and half marks are listed instead of \p{M}*, which V8 runs ~40x slower here.
const MARKS =
  '[\\u0300-\\u036f\\u0483-\\u0489\\u0591-\\u05c7\\u0610-\\u061a\\u064b-\\u065f\\u0670\\u06d6-\\u06ed\\u1ab0-\\u1aff\\u1dc0-\\u1dff\\u20d0-\\u20ff\\ufe00-\\ufe0f\\ufe20-\\ufe2f]*'
const namePattern = (key: string): string =>
  key
    .split(' ')
    .map((w) =>
      [...w]
        .map((c) =>
          c === "'"
            ? `[${APOSTROPHES}]?`
            : (VARIANTS.has(c) ? `[${VARIANTS.get(c)}]` : escape(c)) + MARKS
        )
        .join('')
    )
    .join(`[${HYPHENS}]+`)
const hasLetter = (s: string): boolean => /[\p{L}\p{N}]/u.test(s)

// Name particles stay in the full-name key but are never names on their own ("del" in "reunión del lunes").
const PARTICLES = new Set(
  'de del la las los da di du do dos das le el y e van von der den bin'.split(' ')
)
const RESERVED = new Set(['me', 'someone', 'email', 'phone', 'link', 'handle'])

type Who = { role: string; real: string } // role: plain text, no brackets; real: the name restore gives back
type RoleToken = { words: string[]; real: string; numbered: boolean } // numbered ([Manager 1]) restores only exactly
const words = (s: string): string[] => s.toLowerCase().split(/\s+/).filter(Boolean)

// A model may shorten "[Teammate on the forecasting project]" to "[Teammate]". It restores only when the inner words
// are a strict whole-word prefix of exactly one person token, that token is not numbered, and it is no fixed token.
function restoreShortened(m: string, roles: RoleToken[]): string | undefined {
  const inner = words(m.slice(1, -1))
  if (!inner.length || (inner.length === 1 && (RESERVED.has(inner[0]) || inner[0] === 'person')))
    return undefined
  const hits = roles.filter(
    (r) => inner.length < r.words.length && inner.every((x, i) => x === r.words[i])
  )
  return hits.length === 1 && !hits[0].numbered ? hits[0].real : undefined
}

/** Name swapping shared by `buildProfileContext` and `scrubForModel`. */
function nameSwapper(profile: Profile): {
  swap: (text: string) => string
  scrubRole: (role: string, self: Who, selfText: string) => string
  owner: Who
  restoreMap: Map<string, string> // lowercased "[Role]" -> real name
  roles: RoleToken[] // every person token, for restoring a shortened one
} {
  // Replace all names in ONE pass, so replacement text is never re-scanned. People override the owner.
  const owner: Who = { role: 'Me', real: profile.name.trim() }
  const someone: Who = { role: 'someone', real: '' }
  const who = new Map<string, Who>() // folded full name -> person
  // A name with no letter or digit would become a pattern that matches the empty string.
  if (hasLetter(fold(owner.real))) who.set(fold(owner.real), owner)
  for (const p of profile.people) {
    const k = fold(p.name)
    // A role holds no brackets or contact tokens, so its [token] stays one restorable unit.
    const role = stripContacts(p.role).replace(/\[(?:email|handle|link|phone)\]|[[\]]/g, '')
    if (hasLetter(k)) who.set(k, { role: role.replace(/\s+/g, ' ').trim(), real: p.name.trim() })
  }
  // Each word (2+ letters, not a particle) of a full name, with and without its apostrophe part ("o'brien", "brien"),
  // each hyphenated word written as one ("jeanpierre"), and the name without spaces ("samrivera")
  // point to the same person; a word two people share is just "someone". A part restores to the full name.
  // shortcut: words match case-insensitively, so a person "Will" also swaps the verb "will"; this errs toward privacy, add a common-word case rule if decodes suffer.
  // shortcut: [someone] is never restored, so the user may see it literally; explain it in the system prompt if users ask.
  // shortcut: nicknames not in the profile ("Sammy"), initial+surname usernames ("srivera") and possessives without an apostrophe ("Danas") pass; they need name detection.
  const all = new Map(who)
  for (const [k, w] of who) {
    const hyphened = w.real
      .split(/\s+/)
      .filter((x) => /[‐‑-]/.test(x))
      .map((x) => fold(x).replace(/ /g, ''))
    const words = [...new Set([...k.split(' '), ...k.split(/[ ']/), ...hyphened])].filter(
      (x) => x.length >= 2 && !PARTICLES.has(x) && hasLetter(x)
    )
    for (const word of k.includes(' ') ? [...words, k.replace(/ /g, '')] : words) {
      if (who.has(word)) continue
      all.set(word, all.has(word) && all.get(word) !== w ? someone : w)
    }
  }
  // Longest first so "Ana Maria" wins over "Ana". Digits and "_" count as boundaries, so "sam_rivera" and "sam123" match.
  // Scripts written without spaces (and Korean particles) glue names to the next word, so those keys skip the word boundary.
  // shortcut: Arabic/Hebrew prefixes glued to a name still leak; add those scripts to `unspaced` if that matters.
  // shortcut: one-character Han names and name parts that are ordinary words (まい, ชาย, 지원) over-scrub; partial CJK names stored without a space
  // (田中太郎 vs "田中さん", 王伟 vs "王总") are not caught; Tibetan syllable-split parts leak. Users should store CJK names with a space between family and given name.
  const U =
    '\\p{sc=Han}\\p{sc=Hiragana}\\p{sc=Katakana}\\p{sc=Hangul}\\p{sc=Thai}\\p{sc=Lao}\\p{sc=Khmer}\\p{sc=Myanmar}\\p{sc=Tibetan}'
  const unspaced = new RegExp(`[${U}]`, 'u')
  const edge = `(?![${U}])[\\p{L}\\p{M}]` // a letter or mark, but not one from a script written without spaces
  const keys = [...all.keys()].sort((x, y) => y.length - x.length)
  const spaced = keys.filter((k) => !unspaced.test(k)).map(namePattern)
  const glued = keys.filter((k) => unspaced.test(k)).map(namePattern)
  const alts = [
    ...(spaced.length ? [`(?<!${edge})(?:${spaced.join('|')})(?!${edge})`] : []),
    ...glued
  ]
  const re = alts.length ? new RegExp(alts.join('|'), 'giu') : null
  // Looked up without apostrophes, since the pattern lets "OBrien" match "O'Brien".
  const bare = new Map([...all].map(([k, w]) => [k.replace(/'/g, ''), w]))
  const find = (m: string): Who => bare.get(fold(m).replace(/'/g, '')) ?? someone
  // Names inside a role would leak through the replacement, so a role is scrubbed one level deep:
  // another person's name becomes their plain role (any name left inside that becomes "Me" for the owner, else "someone"),
  // and the person's own name becomes "this person", which keeps self-references from looping.
  const scrubRole = (role: string, self: Who, selfText: string): string =>
    re
      ? role.replace(re, (m) => {
          const w = find(m)
          return w === self
            ? selfText
            : w.role.replace(re, (n) => (find(n) === owner ? 'Me' : 'someone'))
        })
      : role
  const token = new Map<Who, string>([
    [owner, '[Me]'],
    [someone, '[someone]']
  ])
  const restoreMap = new Map<string, string>()
  if (owner.real) restoreMap.set('[me]', owner.real)
  const people = [...new Set(who.values())].filter((w) => w !== owner)
  // A role that is empty or reads like a fixed token becomes "person", so it cannot take over [Me] or [email].
  const base = people.map((w) => {
    const b = scrubRole(w.role, w, 'this person')
    return !b || RESERVED.has(b.toLowerCase()) ? 'person' : b
  })
  const used = new Set([...RESERVED].map((r) => `[${r}]`))
  const roles: RoleToken[] = []
  people.forEach((w, i) => {
    const same = people.filter((_, j) => base[j].toLowerCase() === base[i].toLowerCase())
    // People sharing a role get numbered tokens; a suffix covers clashes like "Manager" x2 next to "Manager 1".
    const b = same.length > 1 ? `${base[i]} ${same.indexOf(w) + 1}` : base[i]
    let t = `[${b}]`
    for (let n = 2; used.has(t.toLowerCase()); n++) t = `[${b} ${n}]`
    used.add(t.toLowerCase())
    token.set(w, t)
    restoreMap.set(t.toLowerCase(), w.real)
    roles.push({ words: words(t.slice(1, -1)), real: w.real, numbered: t !== `[${base[i]}]` })
  })
  const swap = (text: string): string => (re ? text.replace(re, (m) => token.get(find(m))!) : text)
  return { swap, scrubRole, owner, restoreMap, roles }
}

/** Claude-ready text. Names become [Role], contacts are removed; pending entries are never included. */
export function buildProfileContext(profile: Profile): string {
  const { swap, scrubRole, owner } = nameSwapper(profile)
  const clean = (s: string): string => swap(stripContacts(s))

  const lines: string[] = [`[Me], ${scrubRole(stripContacts(profile.role), owner, 'Me')}`]
  for (const section of SECTIONS) {
    const entries = profile.sections[section]
    if (!entries?.length) continue
    lines.push('', `## ${section}`)
    for (const e of entries) lines.push(`- ${clean(e.text)} (${e.origin})`)
  }
  if (profile.calmingStrategies.length) {
    lines.push('', '## calmingStrategies')
    for (const c of profile.calmingStrategies) {
      lines.push(`- ${clean(c.label)} (${c.minutes} min) (${c.origin})`)
    }
  }
  return lines.join('\n')
}

/**
 * The text as it may leave the machine: emails, links and phone numbers removed, names swapped
 * for [Role] / [Me]. `restore` turns the role tokens in a reply back into the real names.
 */
export function scrubForModel(
  text: string,
  profile: Profile
): { text: string; restore: (s: string) => string } {
  const { swap, restoreMap, roles } = nameSwapper(profile)
  // Contacts before names, so a name inside an address cannot split it.
  return {
    text: swap(stripContacts(text)),
    // shortcut: a message that already contains a token ("ask [Manager 1]") is restored to a real name; owner-only output, escape typed tokens if it misleads.
    restore: (s) =>
      s.replace(
        /\[[^\]]+\]/g,
        (m) => restoreMap.get(m.toLowerCase()) ?? restoreShortened(m, roles) ?? m
      )
  }
}

/** Every string in a decode, restored. Only strings change; shape and other values are kept. */
export function restoreDecoded(decode: Decoded, restore: (s: string) => string): Decoded {
  const walk = (v: unknown): unknown =>
    typeof v === 'string'
      ? restore(v)
      : Array.isArray(v)
        ? v.map(walk)
        : v && typeof v === 'object'
          ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]))
          : v
  return walk(decode) as Decoded
}

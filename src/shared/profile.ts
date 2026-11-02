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
const TAIL = `[^\\s<>"]*[^\\s<>".,;:!?)\\]']` // a URL tail never ends on sentence punctuation
// shortcut: a bare domain (no scheme, no www.) is only caught for the TLDs listed here, so "startup.xyz" passes; widen the list when a real case shows up.
const URL_RE = new RegExp(
  `\\b(?:(?:https?|ftp)://|www\\.)${TAIL}|(?<![\\w.@-])(?:[a-z0-9-]+\\.)+(?:com|org|net|io|co|edu|gov|app|dev|ai|me|info|mx|es|uk|de|fr)\\b(?:[/?#]${TAIL})?`,
  'giu'
)
// shortcut: any run of 7+ digits split by spaces/dashes reads as a phone ("tasks 10 20 30 40" too); safe for privacy but may drop meaning, tighten if decodes suffer.
const PHONE = /(?<![\d+])\+?\(?\d[\d\s().-]{5,}\d(?!\w)/g
const ISO_DATES = /^\d{4}-\d{2}-\d{2}(?:\s+\d{4}-\d{2}-\d{2})*$/

/** NFC text with emails, links and phone numbers removed. Emails first: they may sit inside URLs. */
function stripContacts(text: string): string {
  return text
    .normalize('NFC')
    .replace(EMAIL, () => '[email]')
    .replace(URL_RE, () => '[link]')
    .replace(PHONE, (m) => (m.replace(/\D/g, '').length < 7 || ISO_DATES.test(m) ? m : '[phone]'))
}

// Case, accents and spacing folded, so "JOSE", "José" and "José" share one key.
const fold = (s: string): string =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()
const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// Latin base letter -> itself plus its accented forms, so a name matches with or without accents.
const VARIANTS = new Map<string, string>()
for (let cp = 0xc0; cp <= 0x24f; cp++) {
  const ch = String.fromCodePoint(cp)
  const base = fold(ch)
  if (base.length === 1 && base !== ch.toLowerCase()) {
    VARIANTS.set(base, (VARIANTS.get(base) ?? base) + ch)
  }
}
const namePattern = (key: string): string =>
  key
    .split(' ')
    .map((w) => [...w].map((c) => (VARIANTS.has(c) ? `[${VARIANTS.get(c)}]` : escape(c))).join(''))
    .join('\\s+')

type Who = { role: string; real: string } // role: plain text, no brackets; real: the name restore gives back

/** Name swapping shared by `buildProfileContext` and `scrubForModel`. */
function nameSwapper(profile: Profile): {
  swap: (text: string) => string
  scrubRole: (role: string, self: Who, selfText: string) => string
  owner: Who
  restoreMap: Map<string, string> // lowercased "[Role]" -> real name
} {
  // Replace all names in ONE pass, so replacement text is never re-scanned. People override the owner.
  const owner: Who = { role: 'Me', real: profile.name.trim() }
  const someone: Who = { role: 'someone', real: '' }
  const who = new Map<string, Who>() // folded full name -> person
  if (fold(owner.real)) who.set(fold(owner.real), owner)
  for (const p of profile.people) {
    const k = fold(p.name)
    if (k) who.set(k, { role: stripContacts(p.role.trim()), real: p.name.trim() })
  }
  // Each word (3+ letters) of a full name points to the same person; a word two people share is just "someone".
  const all = new Map(who)
  for (const [k, w] of who) {
    for (const word of k.split(' ')) {
      if (word.length < 3 || who.has(word)) continue
      all.set(word, all.has(word) && all.get(word) !== w ? someone : w)
    }
  }
  // Longest first so "Ana Maria" wins over "Ana".
  const names = [...all.keys()].sort((x, y) => y.length - x.length).map(namePattern)
  const re = names.length
    ? new RegExp(`(?<![\\p{L}\\p{M}\\p{N}_])(?:${names.join('|')})(?![\\p{L}\\p{M}\\p{N}_])`, 'giu')
    : null
  const find = (m: string): Who => all.get(fold(m)) ?? someone
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
  const base = people.map((w) => scrubRole(w.role, w, 'this person'))
  people.forEach((w, i) => {
    const same = people.filter((_, j) => base[j].toLowerCase() === base[i].toLowerCase())
    // People sharing a role get numbered tokens, so restore stays one-to-one.
    const t = same.length > 1 ? `[${base[i]} ${same.indexOf(w) + 1}]` : `[${base[i]}]`
    token.set(w, t)
    restoreMap.set(t.toLowerCase(), w.real)
  })
  const swap = (text: string): string => (re ? text.replace(re, (m) => token.get(find(m))!) : text)
  return { swap, scrubRole, owner, restoreMap }
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
  const { swap, restoreMap } = nameSwapper(profile)
  // Contacts before names, so a name inside an address cannot split it.
  return {
    text: swap(stripContacts(text)),
    restore: (s) => s.replace(/\[[^\]]+\]/g, (m) => restoreMap.get(m.toLowerCase()) ?? m)
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

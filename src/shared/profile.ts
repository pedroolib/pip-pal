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

/** Name swapping shared by `buildProfileContext` and `scrubForModel`. */
function nameSwapper(profile: Profile): {
  swap: (text: string) => string
  scrubRole: (role: string, self: string, selfText: string) => string
  own: string
  restoreMap: Map<string, string> // lowercased "[Role]" -> real name
} {
  const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Replace all names in ONE pass, so replacement text is never re-scanned. People override the owner.
  const own = profile.name.trim().toLowerCase()
  const plain = new Map<string, string>() // name -> plain role text, no brackets
  const real = new Map<string, string>() // lowercased name -> name as written
  if (own) {
    plain.set(own, 'Me')
    real.set(own, profile.name.trim())
  }
  for (const p of profile.people) {
    const name = p.name.trim().toLowerCase()
    if (name) {
      plain.set(name, p.role.trim())
      real.set(name, p.name.trim())
    }
  }
  // Longest first so "Ana Maria" wins over "Ana".
  const names = [...plain.keys()].sort((x, y) => y.length - x.length).map(escape)
  const re = names.length
    ? new RegExp(`(?<![\\p{L}\\p{N}_])(?:${names.join('|')})(?![\\p{L}\\p{N}_])`, 'giu')
    : null
  // Names inside a role would leak through the replacement, so a role is scrubbed one level deep:
  // another person's name becomes their plain role (any name left inside that becomes "Me" for the owner, else "someone"),
  // and the person's own name becomes "this person", which keeps self-references from looping.
  const scrubRole = (role: string, self: string, selfText: string): string =>
    re
      ? role.replace(re, (m) => {
          const k = m.toLowerCase()
          return k === self
            ? selfText
            : (plain.get(k) ?? '').replace(re, (n) =>
                n.toLowerCase() === own && plain.get(own) === 'Me' ? 'Me' : 'someone'
              )
        })
      : role
  const repl = new Map<string, string>()
  const restoreMap = new Map<string, string>()
  for (const [k, role] of plain) {
    const token = `[${k === own && role === 'Me' ? 'Me' : scrubRole(role, k, 'this person')}]`
    repl.set(k, token)
    // Two people sharing a role is ambiguous to undo: the first one listed wins.
    if (!restoreMap.has(token.toLowerCase())) restoreMap.set(token.toLowerCase(), real.get(k)!)
  }
  const swap = (text: string): string =>
    re ? text.replace(re, (m) => repl.get(m.toLowerCase()) ?? m) : text
  return { swap, scrubRole, own, restoreMap }
}

/** Claude-ready text. Names of people become [Role]; pending entries are never included. */
export function buildProfileContext(profile: Profile): string {
  const { swap, scrubRole, own } = nameSwapper(profile)

  const lines: string[] = [`[Me], ${scrubRole(profile.role, own, 'Me')}`]
  for (const section of SECTIONS) {
    const entries = profile.sections[section]
    if (!entries?.length) continue
    lines.push('', `## ${section}`)
    for (const e of entries) lines.push(`- ${swap(e.text)} (${e.origin})`)
  }
  if (profile.calmingStrategies.length) {
    lines.push('', '## calmingStrategies')
    for (const c of profile.calmingStrategies) {
      lines.push(`- ${swap(c.label)} (${c.minutes} min) (${c.origin})`)
    }
  }
  return lines.join('\n')
}

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu
const TAIL = `[^\\s<>"]*[^\\s<>".,;:!?)\\]']` // a URL tail never ends on sentence punctuation
const URL_RE = new RegExp(
  `\\b(?:(?:https?|ftp)://|www\\.)${TAIL}|(?<![\\w.@-])(?:[a-z0-9-]+\\.)+(?:com|org|net|io|co|edu|gov|app|dev|ai|me|info|mx|es|uk|de|fr)\\b(?:[/?#]${TAIL})?`,
  'giu'
)
const PHONE = /(?<![\w+])\+?\(?\d[\d\s().-]{5,}\d(?!\w)/g

/**
 * The text as it may leave the machine: emails, links and phone numbers removed, names swapped
 * for [Role] / [Me]. `restore` turns the role tokens in a reply back into the real names.
 */
export function scrubForModel(
  text: string,
  profile: Profile
): { text: string; restore: (s: string) => string } {
  const { swap, restoreMap } = nameSwapper(profile)
  // Emails first (they may sit inside URLs), and all of it before names so a name in an address cannot split it.
  const stripped = text
    .replace(EMAIL, () => '[email]')
    .replace(URL_RE, () => '[link]')
    .replace(PHONE, (m) => {
      const digits = m.replace(/\D/g, '').length
      return digits < 7 || digits > 15 || /^\d{4}-\d{2}-\d{2}$/.test(m) ? m : '[phone]'
    })
  return {
    text: swap(stripped),
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

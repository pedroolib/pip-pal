// Pure profile helpers shared by main, renderer and the AI side.
import { SECTIONS, type Profile, type ProfileEntry, type Recipient } from './schemas'

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

/** Claude-ready text. Names of people become [Role]; pending entries are never included. */
export function buildProfileContext(profile: Profile): string {
  const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // One pass over all names, so replacement text is never re-scanned. People override the owner.
  const repl = new Map<string, string>()
  const own = profile.name.trim()
  if (own) repl.set(own.toLowerCase(), '[Me]')
  for (const p of profile.people) {
    const name = p.name.trim()
    if (name) repl.set(name.toLowerCase(), `[${p.role.trim()}]`)
  }
  // Longest first so "Ana Maria" wins over "Ana".
  const names = [...repl.keys()].sort((x, y) => y.length - x.length).map(escape)
  const re = names.length
    ? new RegExp(`(?<![\\p{L}\\p{N}_])(?:${names.join('|')})(?![\\p{L}\\p{N}_])`, 'giu')
    : null
  const swap = (text: string): string =>
    re ? text.replace(re, (m) => repl.get(m.toLowerCase()) ?? m) : text

  const lines: string[] = [`[Me], ${swap(profile.role)}`]
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

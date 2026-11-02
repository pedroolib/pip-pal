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
  // Replace all names in ONE pass, so replacement text is never re-scanned. People override the owner.
  const own = profile.name.trim().toLowerCase()
  const plain = new Map<string, string>() // name -> plain role text, no brackets
  if (own) plain.set(own, 'Me')
  for (const p of profile.people) {
    const name = p.name.trim().toLowerCase()
    if (name) plain.set(name, p.role.trim())
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
  for (const [k, role] of plain)
    repl.set(k, `[${k === own && role === 'Me' ? 'Me' : scrubRole(role, k, 'this person')}]`)
  const swap = (text: string): string =>
    re ? text.replace(re, (m) => repl.get(m.toLowerCase()) ?? m) : text

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

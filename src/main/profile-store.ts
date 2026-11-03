import { readFileSync } from 'fs'
import samJson from '@shared/fixtures/sam.profile.json'
import { ensureIds } from '@shared/profile'
import { Profile } from '@shared/schemas'
import { backupFile, writeJsonAtomic } from './json-file'

// Before onboarding, entries came from the coach (`coach`) or from patterns (`pip`).
const ORIGINS: Record<string, string> = { coach: 'onboarding', pip: 'learned' }

/** Renames the old origins in entries, strategies and suggestions; anything else is untouched. */
function migrate(data: unknown): unknown {
  if (typeof data !== 'object' || data === null) return data
  const fix = (list: unknown): unknown =>
    Array.isArray(list)
      ? list.map((x) =>
          x && typeof x === 'object' && ORIGINS[(x as { origin?: string }).origin ?? '']
            ? { ...x, origin: ORIGINS[(x as { origin: string }).origin] }
            : x
        )
      : list
  const p = data as Record<string, unknown>
  const sections = p.sections
  return {
    ...p,
    ...(sections && typeof sections === 'object'
      ? { sections: Object.fromEntries(Object.entries(sections).map(([k, v]) => [k, fix(v)])) }
      : {}),
    calmingStrategies: fix(p.calmingStrategies),
    ...(p.pending ? { pending: fix(p.pending) } : {})
  }
}

/** `seed` fills a missing or corrupt file: Sam in demo mode and tests, an empty profile for a real person. */
export function createProfileStore(
  file: string,
  seedJson: unknown = samJson
): {
  load(): Profile
  save(profile: Profile): void
} {
  const write = (p: Profile): void => writeJsonAtomic(file, p)
  const seed = (): Profile => {
    const p = ensureIds(Profile.parse(seedJson))
    write(p)
    return p
  }

  return {
    load(): Profile {
      let raw: string
      try {
        raw = readFileSync(file, 'utf8')
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return seed() // first run
        throw err // never overwrite a profile we merely failed to read
      }
      let p: Profile
      try {
        p = ensureIds(Profile.parse(migrate(JSON.parse(raw))))
      } catch {
        backupFile(file)
        return seed()
      }
      try {
        write(p) // persist freshly minted ids so they stay stable
      } catch {
        // shortcut: read-only disk; keep going with ids in memory, the next save/load retries
      }
      return p
    },
    save(profile: Profile): void {
      write(Profile.parse(profile))
    }
  }
}

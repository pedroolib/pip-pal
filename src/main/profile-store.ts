import { readFileSync } from 'fs'
import samJson from '@shared/fixtures/sam.profile.json'
import { ensureIds } from '@shared/profile'
import { Profile } from '@shared/schemas'
import { backupFile, writeJsonAtomic } from './json-file'

export function createProfileStore(file: string): {
  load(): Profile
  save(profile: Profile): void
} {
  const write = (p: Profile): void => writeJsonAtomic(file, p)
  const seed = (): Profile => {
    const p = ensureIds(Profile.parse(samJson))
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
        p = ensureIds(Profile.parse(JSON.parse(raw)))
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

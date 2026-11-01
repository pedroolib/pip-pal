import { copyFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import samJson from '@shared/fixtures/sam.profile.json'
import { ensureIds } from '@shared/profile'
import { Profile } from '@shared/schemas'

export function createProfileStore(file: string): {
  load(): Profile
  save(profile: Profile): void
} {
  const write = (p: Profile): void => {
    mkdirSync(dirname(file), { recursive: true })
    const tmp = file + '.tmp'
    writeFileSync(tmp, JSON.stringify(p, null, 2), { mode: 0o600 }) // health-related data
    renameSync(tmp, file) // atomic: a crash never leaves a half-written profile
  }
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
        copyFileSync(file, `${file}.${Date.now()}.bak`)
        return seed()
      }
      write(p) // persist freshly minted ids so they stay stable
      return p
    },
    save(profile: Profile): void {
      write(Profile.parse(profile))
    }
  }
}

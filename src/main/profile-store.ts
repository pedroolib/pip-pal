import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from 'fs'
import { basename, dirname, join } from 'path'
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
  const backup = (): void => {
    const dir = dirname(file)
    const prefix = basename(file) + '.'
    const stamp = (f: string): number => parseInt(f.slice(prefix.length), 10)
    const mine = (): string[] =>
      readdirSync(dir)
        .filter((f) => f.startsWith(prefix) && /^\d+\.bak$/.test(f.slice(prefix.length)))
        .sort((x, y) => stamp(x) - stamp(y))
    // strictly increasing names, even after pruning freed the newest-but-one slot
    const ts = Math.max(
      Date.now(),
      ...mine()
        .map(stamp)
        .map((n) => n + 1)
    )
    copyFileSync(file, join(dir, `${prefix}${ts}.bak`))
    for (const old of mine().slice(0, -3)) unlinkSync(join(dir, old)) // keep the 3 newest
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
        backup()
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

// Safe JSON files in userData, shared by the profile and the day-to-day logs (docs/DECISIONS.md §6).
import { copyFileSync, mkdirSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'fs'
import { basename, dirname, join } from 'path'

export function writeJsonAtomic(file: string, data: unknown): void {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = file + '.tmp'
  writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 }) // health-related data
  renameSync(tmp, file) // atomic: a crash never leaves a half-written file
}

/** Copies `file` to `file.<n>.bak` before it is replaced, keeping the 3 newest copies. */
export function backupFile(file: string): void {
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

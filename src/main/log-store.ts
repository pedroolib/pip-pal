// An append-only list in one JSON file: check-ins, changes and achievements.
import { readFileSync } from 'fs'
import type { z } from 'zod'
import { backupFile, writeJsonAtomic } from './json-file'

/**
 * `seed` fills the file on first run (Sam's demo week). A corrupt file is backed up and the list
 * starts empty instead: mixing demo data into someone's real history would be worse than a gap.
 */
export function createLogStore<T>(
  file: string,
  schema: z.ZodType<T>,
  seed: unknown[] = []
): {
  list(): T[]
  add(item: T): void
} {
  const list = (): T[] => {
    let raw: string
    try {
      raw = readFileSync(file, 'utf8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err // never overwrite what we failed to read
      const items = schema.array().parse(seed)
      writeJsonAtomic(file, items)
      return items
    }
    try {
      return schema.array().parse(JSON.parse(raw))
    } catch {
      backupFile(file)
      writeJsonAtomic(file, [])
      return []
    }
  }

  return {
    list,
    add(item: T): void {
      const valid = schema.parse(item) // before reading, so a bad item never touches the file
      writeJsonAtomic(file, [...list(), valid])
    }
  }
}

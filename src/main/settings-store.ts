import { readFileSync } from 'fs'
import { z } from 'zod'
import { DEFAULT_SETTINGS, Settings, slotForHour } from '@shared/schemas'
import { backupFile, writeJsonAtomic } from './json-file'

// Before check-in times were editable, settings.json kept one switch per slot.
const OldCheckIns = z.object({ morning: z.boolean(), midday: z.boolean(), afternoon: z.boolean() })

/** Turns the old switches into the default times with the same on/off; anything else is untouched. */
function migrate(data: unknown): unknown {
  if (typeof data !== 'object' || data === null) return data
  const old = OldCheckIns.safeParse((data as { checkIns?: unknown }).checkIns)
  if (!old.success) return data
  const checkIns = DEFAULT_SETTINGS.checkIns.map((c) => ({
    ...c,
    enabled: old.data[slotForHour(+c.time.slice(0, 2))]
  }))
  return { ...data, checkIns }
}

export function createSettingsStore(file: string): {
  load(): Settings
  save(settings: Settings): void
} {
  return {
    load(): Settings {
      let raw: string
      try {
        raw = readFileSync(file, 'utf8')
      } catch {
        return DEFAULT_SETTINGS // first run, or unreadable: defaults, and nothing gets overwritten
      }
      try {
        return Settings.parse(migrate(JSON.parse(raw)))
      } catch {
        backupFile(file)
        return DEFAULT_SETTINGS
      }
    },
    save(settings: Settings): void {
      writeJsonAtomic(file, Settings.parse(settings))
    }
  }
}

import { readFileSync } from 'fs'
import { DEFAULT_SETTINGS, Settings } from '@shared/schemas'
import { backupFile, writeJsonAtomic } from './json-file'

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
        return Settings.parse(JSON.parse(raw))
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

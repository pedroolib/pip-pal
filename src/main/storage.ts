// Everything Pip keeps, as JSON files in userData (docs/DECISIONS.md §6).
import { app } from 'electron'
import { join } from 'path'
import { Achievement, ChangeEvent, CheckIn } from '@shared/schemas'
import checkInsJson from '@shared/fixtures/week.checkins.json'
import changesJson from '@shared/fixtures/week.changes.json'
import achievementsJson from '@shared/fixtures/achievements.json'
import eventsJson from '@shared/fixtures/week.events.json'
import { createEventStore } from './event-store'
import { createLogStore } from './log-store'
import { createProfileStore } from './profile-store'
import { createSettingsStore } from './settings-store'

export function openStorage(): {
  profiles: ReturnType<typeof createProfileStore>
  settings: ReturnType<typeof createSettingsStore>
  checkIns: ReturnType<typeof createLogStore<CheckIn>>
  changes: ReturnType<typeof createLogStore<ChangeEvent>>
  achievements: ReturnType<typeof createLogStore<Achievement>>
  events: ReturnType<typeof createEventStore>
} {
  const data = (name: string): string => join(app.getPath('userData'), name)
  return {
    profiles: createProfileStore(data('profile.json')),
    settings: createSettingsStore(data('settings.json')),
    // Seeded with Sam's demo week so Mi resumen has something to summarize on first run.
    checkIns: createLogStore(data('checkins.json'), CheckIn, checkInsJson),
    changes: createLogStore(data('changes.json'), ChangeEvent, changesJson),
    achievements: createLogStore(data('achievements.json'), Achievement, achievementsJson),
    events: createEventStore(data('events.json'), eventsJson)
  }
}

export type Storage = ReturnType<typeof openStorage>

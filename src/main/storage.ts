// Everything Pip keeps, as JSON files in userData (docs/DECISIONS.md §6).
import { app } from 'electron'
import { join } from 'path'
import {
  Achievement,
  ChangeEvent,
  CheckIn,
  Reminder,
  SECTIONS,
  type Lesson,
  type Profile
} from '@shared/schemas'
import samJson from '@shared/fixtures/sam.profile.json'
import checkInsJson from '@shared/fixtures/week.checkins.json'
import changesJson from '@shared/fixtures/week.changes.json'
import achievementsJson from '@shared/fixtures/achievements.json'
import eventsJson from '@shared/fixtures/week.events.json'
import { StoredLesson } from './ai/lessons'
import { createEventStore } from './event-store'
import { createLogStore } from './log-store'
import { createProfileStore } from './profile-store'
import { createSettingsStore } from './settings-store'

/** A real person's first profile: nothing in it until onboarding or My profile fills it. */
const EMPTY_PROFILE: Profile = {
  name: '',
  role: '',
  people: [],
  sections: Object.fromEntries(SECTIONS.map((s) => [s, []])) as unknown as Profile['sections'],
  calmingStrategies: []
}

export function openStorage(): {
  /** `PIP_DEMO=1`: first run loads Sam and his week, and onboarding counts as done. */
  demo: boolean
  profiles: ReturnType<typeof createProfileStore>
  settings: ReturnType<typeof createSettingsStore>
  checkIns: ReturnType<typeof createLogStore<CheckIn>>
  changes: ReturnType<typeof createLogStore<ChangeEvent>>
  achievements: ReturnType<typeof createLogStore<Achievement>>
  events: ReturnType<typeof createEventStore>
  lessons: ReturnType<typeof createLogStore<Lesson>>
  reminders: ReturnType<typeof createLogStore<Reminder>>
} {
  const data = (name: string): string => join(app.getPath('userData'), name)
  const demo = process.env.PIP_DEMO === '1'
  // Seeds apply only when a file is missing: a real person starts empty, the demo with Sam's week.
  const seed = (week: unknown[]): unknown[] => (demo ? week : [])
  return {
    demo,
    profiles: createProfileStore(data('profile.json'), demo ? samJson : EMPTY_PROFILE),
    settings: createSettingsStore(data('settings.json')),
    checkIns: createLogStore(data('checkins.json'), CheckIn, seed(checkInsJson)),
    changes: createLogStore(data('changes.json'), ChangeEvent, seed(changesJson)),
    achievements: createLogStore(data('achievements.json'), Achievement, seed(achievementsJson)),
    events: createEventStore(data('events.json'), seed(eventsJson)),
    lessons: createLogStore(data('lessons.json'), StoredLesson),
    reminders: createLogStore(data('reminders.json'), Reminder)
  }
}

export type Storage = ReturnType<typeof openStorage>

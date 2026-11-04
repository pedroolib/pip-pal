// shortcut: a PipApi backed by the fixtures, with writes kept in memory. Main serves it over IPC until real
// storage (A) and AI (B) replace it handler by handler; the renderer uses it directly in a plain browser.
import type { PipApi } from './ipc'
import {
  Achievement,
  ActionKind,
  ChangeEvent,
  CheckIn,
  DEFAULT_SETTINGS,
  Decoded,
  LoggableEvent,
  type Lesson,
  Expansion,
  NewReminder,
  OnboardingAnswers,
  type PendingEntry,
  Profile,
  Recipient,
  type Reminder,
  ReminderDelay,
  SummaryPeriod,
  UsageEvent,
  Settings,
  Triage
} from './schemas'
import triageJson from './fixtures/demo.triage.json'
import stepsJson from './fixtures/demo.expansion.steps.json'
import questionsJson from './fixtures/demo.expansion.questions.json'
import transitionJson from './fixtures/demo.expansion.transition.json'
import samJson from './fixtures/sam.profile.json'
import decodedJson from './fixtures/demo.decoded.json'
import checkInsJson from './fixtures/week.checkins.json'
import changesJson from './fixtures/week.changes.json'
import achievementsJson from './fixtures/achievements.json'
import eventsJson from './fixtures/week.events.json'
import transcriptJson from './fixtures/demo.transcript.json'

export function createMockApi(): PipApi {
  // Parsing up front doubles as the fixture self-check: a bad fixture fails loudly on startup.
  let profile = Profile.parse(samJson)
  let settings = DEFAULT_SETTINGS
  let reminders: Reminder[] = []
  const decoded = Decoded.parse(decodedJson)
  const triage = Triage.parse(triageJson)
  const expansions = Object.fromEntries(
    [stepsJson, questionsJson, transitionJson].map((e) => [e.kind, Expansion.parse(e)])
  ) as Record<ActionKind, Expansion>
  const checkIns = CheckIn.array().parse(checkInsJson)
  const changes = ChangeEvent.array().parse(changesJson)
  const achievements = Achievement.array().parse(achievementsJson)
  let events = UsageEvent.array().parse(eventsJson)
  let lessons: Lesson[] = [
    {
      id: 'lesson-package-35',
      text: 'Support package 35 is our monthly update bundle, installed from the admin portal.',
      origin: 'self',
      at: '2026-11-02T09:00:00.000Z'
    }
  ]

  return {
    onCaptured: () => () => {},
    onCheckInDue: () => () => {},
    decode: async () => decoded,
    triage: async () => triage,
    // Only after a correction: without an API key the real app uses these fixtures too, and its demo has no notes.
    expand: async (_text, kind, _spoons, _unclear, correction) => ({
      ...expansions[kind],
      lessonsUsed: correction ? lessons.map((l) => l.text) : []
    }),
    getSettings: async () => settings,
    saveSettings: async (s) => void (settings = Settings.parse(s)),
    getProfile: async () => profile,
    saveProfile: async (p) => void (profile = Profile.parse(p)),
    listCheckIns: async () => checkIns,
    saveCheckIn: async (c) => void checkIns.push(CheckIn.parse(c)),
    listChanges: async () => changes,
    saveChange: async (c) => void changes.push(ChangeEvent.parse(c)),
    listAchievements: async () => achievements,
    addAchievement: async (a) => void achievements.push(Achievement.parse(a)),
    logEvent: async (e) => {
      events.push(
        UsageEvent.parse({
          ...LoggableEvent.parse(e),
          id: crypto.randomUUID(),
          at: new Date().toISOString()
        })
      )
    },
    listEvents: async () => [...events],
    deleteEvent: async (id) => void (events = events.filter((e) => e.id !== id)),
    clearEvents: async () => void (events = []),
    listLessons: async () => [...lessons],
    deleteLesson: async (id) => void (lessons = lessons.filter((l) => l.id !== id)),
    rememberCorrection: async (_text, correction) => {
      const note: Lesson = {
        id: crypto.randomUUID(),
        text: correction,
        origin: 'self',
        at: new Date().toISOString()
      }
      lessons = [...lessons, note]
      return {
        kind: 'add',
        noteId: note.id,
        targetId: null,
        oldText: null,
        text: `Pip's cleaner version: ${correction}`,
        why: null
      }
    },
    resolveNote: async ({ noteId, text, edited }) => {
      const origin = edited ? 'self' : 'learned'
      lessons = lessons.map((l) => (l.id === noteId ? { ...l, text, origin } : l))
    },
    proposeMerges: async () =>
      lessons.length < 2
        ? []
        : [
            {
              ids: lessons.slice(0, 2).map((l) => l.id),
              text: 'A shorter note that holds what those two said.',
              why: 'You wrote these about the same thing.'
            }
          ],
    applyMerge: async ({ ids, text }) => {
      const merged: Lesson = {
        id: crypto.randomUUID(),
        text,
        origin: 'learned',
        at: new Date().toISOString()
      }
      lessons = [...lessons.filter((l) => !ids.includes(l.id)), merged]
    },
    refreshLearned: async () => {
      const text = 'Midday is often your lowest-energy time.'
      const known =
        profile.pending?.some((p) => p.key === 'energy:midday') ||
        profile.dismissed?.some((d) => d.key === 'energy:midday') ||
        profile.sections.energy?.some((e) => e.text === text)
      if (!known)
        profile = {
          ...profile,
          pending: [
            ...(profile.pending ?? []),
            {
              id: 'pending-energy-midday',
              key: 'energy:midday',
              section: 'energy',
              text,
              origin: 'learned',
              visibleTo: [],
              why: 'Midday was your lowest check-in on 4 of the last 5 days.'
            }
          ]
        }
      return profile
    },
    // Not Claude: each answer comes back as a suggestion, so the review screen has something to show.
    draftProfile: async (a) => {
      const answers = OnboardingAnswers.parse(a)
      const said = (k: keyof OnboardingAnswers): string | undefined =>
        answers[k]?.trim() || undefined
      const where: [keyof OnboardingAnswers, PendingEntry['section']][] = [
        ['instructions', 'communication'],
        ['changesHelp', 'changes'],
        ['changesNotice', 'changes'],
        ['calming', 'calming'],
        ['sensory', 'sensory'],
        ['strengths', 'strengths']
      ]
      const drafted: PendingEntry[] = where.flatMap(([k, section]) => {
        const text = said(k)
        if (!text) return []
        const id = crypto.randomUUID()
        return [
          {
            id,
            key: `onboarding:${id}`,
            section,
            text,
            ...(section === 'calming' ? { minutes: 10 } : {}),
            origin: 'onboarding' as const,
            visibleTo: [],
            why: `You said: "${text}"`
          }
        ]
      })
      profile = { ...profile, pending: [...(profile.pending ?? []), ...drafted] }
      return profile
    },
    checkAccessibility: async () => null,
    generateSummary: async (r, period) => ({
      recipient: Recipient.parse(r),
      period: SummaryPeriod.parse(period),
      from: checkIns[0].at,
      to: checkIns[checkIns.length - 1].at,
      points: [
        {
          text: 'Energy dipped mid-week (1–2 spoons on Thursday).',
          why: 'Thursday check-ins: 2, 1, 2 spoons.',
          source: 'checkins',
          include: true
        },
        {
          text: 'The report deadline moved with one day of notice.',
          why: 'One project change logged this week.',
          source: 'changes',
          include: true
        },
        {
          text: 'Asked instead of guessing once this week.',
          why: 'One "asked, not guessed" achievement this week.',
          source: 'achievements',
          include: true
        }
      ]
    }),
    exportSummaryPdf: async () => null,
    // A plain browser keeps the list but never fires: timers need main (src/main/reminders.ts).
    addReminder: async (r, delay) => {
      const added: Reminder = {
        ...NewReminder.parse(r),
        id: crypto.randomUUID(),
        dueAt: new Date().toISOString(),
        nudges: 0,
        parked: false
      }
      ReminderDelay.parse(delay)
      reminders = [...reminders, added]
      return added
    },
    rescheduleReminder: async () => {},
    finishReminder: async (id) => {
      reminders = reminders.filter((r) => r.id !== id)
    },
    showReminder: async () => {},
    listReminders: async () => reminders,
    onReminderDue: () => () => {},
    openHome: () => {},
    setOverlayInteractive: () => {},
    setOverlayBounds: () => {},
    onDismiss: () => () => {},
    setBubbleOpen: () => {},
    setOverlayFocus: () => {},
    // A plain browser has no corner window: the overlay draws the corner Pip in the page instead.
    setCorner: () => {},
    onCorner: () => () => {},
    clickCorner: () => {},
    onCornerOpen: () => () => {},
    onRecordHotkey: () => () => {},
    transcribe: async (audio) => {
      if (audio.length === 0) throw new Error('No audio')
      await new Promise((r) => setTimeout(r, 800))
      return transcriptJson.text
    }
  }
}

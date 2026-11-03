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
  Expansion,
  Profile,
  Recipient,
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

export function createMockApi(): PipApi {
  // Parsing up front doubles as the fixture self-check: a bad fixture fails loudly on startup.
  let profile = Profile.parse(samJson)
  let settings = DEFAULT_SETTINGS
  const decoded = Decoded.parse(decodedJson)
  const triage = Triage.parse(triageJson)
  const expansions = Object.fromEntries(
    [stepsJson, questionsJson, transitionJson].map((e) => [e.kind, Expansion.parse(e)])
  ) as Record<ActionKind, Expansion>
  const checkIns = CheckIn.array().parse(checkInsJson)
  const changes = ChangeEvent.array().parse(changesJson)
  const achievements = Achievement.array().parse(achievementsJson)
  let events = UsageEvent.array().parse(eventsJson)

  return {
    onCaptured: () => () => {},
    onCheckInDue: () => () => {},
    decode: async () => decoded,
    triage: async () => triage,
    expand: async (_text, kind) => expansions[kind],
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
              origin: 'pip',
              visibleTo: [],
              why: 'Midday was your lowest check-in on 4 of the last 5 days.'
            }
          ]
        }
      return profile
    },
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
    openHome: () => {},
    setOverlayInteractive: () => {},
    setOverlayBounds: () => {},
    onDismiss: () => () => {},
    setBubbleOpen: () => {},
    // A plain browser has no corner window: the overlay draws the corner Pip in the page instead.
    setCorner: () => {},
    onCorner: () => () => {},
    clickCorner: () => {},
    onCornerOpen: () => () => {}
  }
}

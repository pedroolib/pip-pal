// shortcut: a PipApi backed by the fixtures, with writes kept in memory. Main serves it over IPC until real
// storage (A) and AI (B) replace it handler by handler; the renderer uses it directly in a plain browser.
import type { PipApi } from './ipc'
import { Achievement, ChangeEvent, CheckIn, Decoded, Profile, Recipient } from './schemas'
import samJson from './fixtures/sam.profile.json'
import decodedJson from './fixtures/demo.decoded.json'
import checkInsJson from './fixtures/week.checkins.json'
import changesJson from './fixtures/week.changes.json'
import achievementsJson from './fixtures/achievements.json'

export function createMockApi(): PipApi {
  // Parsing up front doubles as the fixture self-check: a bad fixture fails loudly on startup.
  let profile = Profile.parse(samJson)
  const decoded = Decoded.parse(decodedJson)
  const checkIns = CheckIn.array().parse(checkInsJson)
  const changes = ChangeEvent.array().parse(changesJson)
  const achievements = Achievement.array().parse(achievementsJson)

  return {
    onCaptured: () => () => {},
    onCheckInDue: () => () => {},
    decode: async () => decoded,
    getProfile: async () => profile,
    saveProfile: async (p) => void (profile = Profile.parse(p)),
    listCheckIns: async () => checkIns,
    saveCheckIn: async (c) => void checkIns.push(CheckIn.parse(c)),
    listChanges: async () => changes,
    saveChange: async (c) => void changes.push(ChangeEvent.parse(c)),
    listAchievements: async () => achievements,
    addAchievement: async (a) => void achievements.push(Achievement.parse(a)),
    generateSummary: async (r) => ({
      recipient: Recipient.parse(r),
      from: checkIns[0].at,
      to: checkIns[checkIns.length - 1].at,
      points: [
        {
          text: 'Energy dipped mid-week (1–2 spoons on Thursday).',
          source: 'checkins',
          include: true
        },
        {
          text: 'The report deadline moved with one day of notice.',
          source: 'changes',
          include: true
        },
        { text: 'Asked instead of guessing once this week.', source: 'achievements', include: true }
      ]
    }),
    exportSummaryPdf: async () => null,
    openHome: () => {},
    setOverlayInteractive: () => {},
    setOverlayBounds: () => {}
  }
}

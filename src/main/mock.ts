// shortcut: every handler serves fixtures and keeps writes in memory, so the UI can be built before
// storage (A) and AI (B) exist. Replace one handler at a time with the real implementation.
import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import {
  Achievement,
  ChangeEvent,
  CheckIn,
  Decoded,
  Profile,
  Recipient,
  Summary
} from '@shared/schemas'
import samJson from '@shared/fixtures/sam.profile.json'
import decodedJson from '@shared/fixtures/demo.decoded.json'
import checkInsJson from '@shared/fixtures/week.checkins.json'
import changesJson from '@shared/fixtures/week.changes.json'
import achievementsJson from '@shared/fixtures/achievements.json'

export function registerMockHandlers(): void {
  // Parsing at startup doubles as the fixture self-check: a bad fixture crashes `npm run dev` loudly.
  let profile = Profile.parse(samJson)
  const decoded = Decoded.parse(decodedJson)
  const checkIns = CheckIn.array().parse(checkInsJson)
  const changes = ChangeEvent.array().parse(changesJson)
  const achievements = Achievement.array().parse(achievementsJson)

  ipcMain.handle(IPC.decode, () => decoded)
  ipcMain.handle(IPC.profileGet, () => profile)
  ipcMain.handle(IPC.profileSave, (_, p) => void (profile = Profile.parse(p)))
  ipcMain.handle(IPC.checkInList, () => checkIns)
  ipcMain.handle(IPC.checkInSave, (_, c) => void checkIns.push(CheckIn.parse(c)))
  ipcMain.handle(IPC.changeList, () => changes)
  ipcMain.handle(IPC.changeSave, (_, c) => void changes.push(ChangeEvent.parse(c)))
  ipcMain.handle(IPC.achievementList, () => achievements)
  ipcMain.handle(IPC.achievementAdd, (_, a) => void achievements.push(Achievement.parse(a)))
  ipcMain.handle(IPC.summaryGenerate, (_, r): Summary => ({
    recipient: Recipient.parse(r),
    from: checkIns[0].at,
    to: checkIns[checkIns.length - 1].at,
    points: [
      { text: 'Energy dipped mid-week (1–2 spoons on Thursday).', source: 'checkins', include: true },
      { text: 'The report deadline moved with one day of notice.', source: 'changes', include: true },
      { text: 'Asked instead of guessing once this week.', source: 'achievements', include: true }
    ]
  }))
  ipcMain.handle(IPC.summaryExportPdf, () => null)
}

// shortcut: serves the fixture-backed mock over IPC. Replace one handler at a time with the real implementation.
import { app, ipcMain } from 'electron'
import { join } from 'path'
import { IPC } from '@shared/ipc'
import { createMockApi } from '@shared/mock-api'
import { Achievement, ChangeEvent, CheckIn } from '@shared/schemas'
import checkInsJson from '@shared/fixtures/week.checkins.json'
import changesJson from '@shared/fixtures/week.changes.json'
import achievementsJson from '@shared/fixtures/achievements.json'
import { createLogStore } from './log-store'
import { createProfileStore } from './profile-store'

export function registerMockHandlers(): void {
  const api = createMockApi()
  const data = (name: string): string => join(app.getPath('userData'), name)
  const profiles = createProfileStore(data('profile.json'))
  // Seeded with Sam's demo week so Mi resumen has something to summarize on first run.
  const checkIns = createLogStore(data('checkins.json'), CheckIn, checkInsJson)
  const changes = createLogStore(data('changes.json'), ChangeEvent, changesJson)
  const achievements = createLogStore(data('achievements.json'), Achievement, achievementsJson)

  ipcMain.handle(IPC.decode, (_, text, spoons) => api.decode(text, spoons))
  ipcMain.handle(IPC.profileGet, () => profiles.load())
  ipcMain.handle(IPC.profileSave, (_, p) => profiles.save(p))
  ipcMain.handle(IPC.checkInList, () => checkIns.list())
  ipcMain.handle(IPC.checkInSave, (_, c) => checkIns.add(c))
  ipcMain.handle(IPC.changeList, () => changes.list())
  ipcMain.handle(IPC.changeSave, (_, c) => changes.add(c))
  ipcMain.handle(IPC.achievementList, () => achievements.list())
  ipcMain.handle(IPC.achievementAdd, (_, a) => achievements.add(a))
  ipcMain.handle(IPC.summaryGenerate, (_, r) => api.generateSummary(r))
  ipcMain.handle(IPC.summaryExportPdf, () => api.exportSummaryPdf())
}

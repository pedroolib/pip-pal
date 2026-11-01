// shortcut: serves the fixture-backed mock over IPC. Replace one handler at a time with the real implementation.
import { app, ipcMain } from 'electron'
import { join } from 'path'
import { IPC } from '@shared/ipc'
import { createMockApi } from '@shared/mock-api'
import { createProfileStore } from './profile-store'

export function registerMockHandlers(): void {
  const api = createMockApi()
  const profiles = createProfileStore(join(app.getPath('userData'), 'profile.json'))

  ipcMain.handle(IPC.decode, (_, text, spoons) => api.decode(text, spoons))
  ipcMain.handle(IPC.profileGet, () => profiles.load())
  ipcMain.handle(IPC.profileSave, (_, p) => profiles.save(p))
  ipcMain.handle(IPC.checkInList, () => api.listCheckIns())
  ipcMain.handle(IPC.checkInSave, (_, c) => api.saveCheckIn(c))
  ipcMain.handle(IPC.changeList, () => api.listChanges())
  ipcMain.handle(IPC.changeSave, (_, c) => api.saveChange(c))
  ipcMain.handle(IPC.achievementList, () => api.listAchievements())
  ipcMain.handle(IPC.achievementAdd, (_, a) => api.addAchievement(a))
  ipcMain.handle(IPC.summaryGenerate, (_, r) => api.generateSummary(r))
  ipcMain.handle(IPC.summaryExportPdf, () => api.exportSummaryPdf())
}

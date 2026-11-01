// shortcut: serves the fixture-backed mock over IPC. Replace one handler at a time with the real implementation.
import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import { createMockApi } from '@shared/mock-api'

export function registerMockHandlers(): void {
  const api = createMockApi()

  ipcMain.handle(IPC.decode, (_, text, spoons) => api.decode(text, spoons))
  ipcMain.handle(IPC.profileGet, () => api.getProfile())
  ipcMain.handle(IPC.profileSave, (_, p) => api.saveProfile(p))
  ipcMain.handle(IPC.checkInList, () => api.listCheckIns())
  ipcMain.handle(IPC.checkInSave, (_, c) => api.saveCheckIn(c))
  ipcMain.handle(IPC.changeList, () => api.listChanges())
  ipcMain.handle(IPC.changeSave, (_, c) => api.saveChange(c))
  ipcMain.handle(IPC.achievementList, () => api.listAchievements())
  ipcMain.handle(IPC.achievementAdd, (_, a) => api.addAchievement(a))
  ipcMain.handle(IPC.summaryGenerate, (_, r) => api.generateSummary(r))
  ipcMain.handle(IPC.summaryExportPdf, () => api.exportSummaryPdf())
}

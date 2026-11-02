// shortcut: serves the fixture-backed mock over IPC. Replace one handler at a time with the real implementation.
import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import { createMockApi } from '@shared/mock-api'
import type { Storage } from './storage'

export function registerMockHandlers({ profiles, checkIns, changes, achievements }: Storage): void {
  const api = createMockApi()

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

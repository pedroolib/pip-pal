// shortcut: serves the fixture-backed mock over IPC. Replace one handler at a time with the real implementation.
import { app, ipcMain } from 'electron'
import { join } from 'path'
import { IPC } from '@shared/ipc'
import { createMockApi } from '@shared/mock-api'
import { createProfileStore } from './profile-store'
import { createClaudeClient, createJevClient } from './ai/clients'
import { createDecoder } from './ai/decoder'

export function registerMockHandlers(): void {
  const api = createMockApi()
  const profiles = createProfileStore(join(app.getPath('userData'), 'profile.json'))

  if (!app.isPackaged) {
    try {
      process.loadEnvFile() // dev: keys from .env (gitignored); existing env vars win
    } catch {
      // no .env: keys, if any, come from the environment
    }
  }
  const decoder = process.env.ANTHROPIC_API_KEY
    ? createDecoder({
        claude: createClaudeClient(),
        jev: process.env.TYPESAFE_API_KEY ? createJevClient() : null
      })
    : null
  if (!decoder) console.log('ANTHROPIC_API_KEY not set: decode uses the demo fixture.')

  ipcMain.handle(IPC.decode, (_, text, spoons) =>
    decoder ? decoder(text, spoons, profiles.load()) : api.decode(text, spoons)
  )
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

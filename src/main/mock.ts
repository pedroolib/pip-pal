// shortcut: serves the fixture-backed mock over IPC. Replace one handler at a time with the real implementation.
import { app, ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import { createMockApi } from '@shared/mock-api'
import { createClaudeClient, createJevClient, createTriageJevClient } from './ai/clients'
import { createDecoder } from './ai/decoder'
import { createExpander } from './ai/expand'
import { createTriager } from './ai/triage'
import { createAiHandlers } from './ai/index'
import type { Storage } from './storage'

export function registerMockHandlers({ profiles, checkIns, changes, achievements }: Storage): void {
  const api = createMockApi()

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
  const ai = createAiHandlers({
    env: process.env,
    api,
    load: () => profiles.load(),
    makeTriager: () => createTriager({ jev: createTriageJevClient() }),
    makeExpander: () => createExpander({ claude: createClaudeClient() })
  })
  ipcMain.handle(IPC.triage, (_, text) => ai.triage(text))
  ipcMain.handle(IPC.expand, (_, text, kind, spoons, unclear) =>
    ai.expand(text, kind, spoons, unclear)
  )
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

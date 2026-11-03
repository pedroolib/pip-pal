// shortcut: serves the fixture-backed mock over IPC. Replace one handler at a time with the real implementation.
import { ipcMain, systemPreferences } from 'electron'
import { IPC } from '@shared/ipc'
import { createMockApi } from '@shared/mock-api'
import { LEARN_WINDOW_DAYS, type Profile } from '@shared/schemas'
import { createClaudeClient, createJevClient, createTriageJevClient } from './ai/clients'
import { createDecoder } from './ai/decoder'
import { createExpander } from './ai/expand'
import { createProfileDrafter } from './ai/onboarding'
import { createSummarizer } from './ai/summary'
import { createTriager } from './ai/triage'
import { createAiHandlers } from './ai/index'
import { detectPatterns, mergeLearned } from './insights'
import type { Storage } from './storage'

export function registerMockHandlers(
  { demo, profiles, settings, checkIns, changes, achievements, events }: Storage,
  onSettingsSaved: () => void
): void {
  const api = createMockApi()
  const decoder = process.env.ANTHROPIC_API_KEY
    ? createDecoder({
        claude: createClaudeClient(),
        jev: process.env.TYPESAFE_API_KEY ? createJevClient() : null
      })
    : null
  if (!decoder) console.log('ANTHROPIC_API_KEY not set: decode uses the demo fixture.')

  // Pattern detection over the last LEARN_WINDOW_DAYS; new pending entries are saved through the profile store.
  const learn = (): Profile => {
    const now = new Date()
    const profile = profiles.load()
    const from = new Date(now.getTime() - LEARN_WINDOW_DAYS * 86_400_000)
    const data = { checkIns: checkIns.list(), events: events.list() }
    const merged = mergeLearned(profile, detectPatterns(data, profile, from, now), now)
    if (merged !== profile) profiles.save(merged)
    return merged
  }

  ipcMain.handle(IPC.decode, (_, text, spoons) =>
    decoder ? decoder(text, spoons, profiles.load()) : api.decode(text, spoons)
  )
  const ai = createAiHandlers({
    env: process.env,
    api,
    load: () => profiles.load(),
    save: (p) => profiles.save(p),
    makeTriager: () => createTriager({ jev: createTriageJevClient() }),
    makeExpander: () => createExpander({ claude: createClaudeClient() }),
    makeSummarizer: () => createSummarizer({ claude: createClaudeClient() }),
    makeDrafter: () => createProfileDrafter({ claude: createClaudeClient() }),
    summaryData: () => ({
      checkIns: checkIns.list(),
      events: events.list(),
      achievements: achievements.list()
    }),
    logEvent: (e) => events.add(e)
  })
  ipcMain.handle(IPC.triage, (_, text) => ai.triage(text))
  ipcMain.handle(IPC.expand, (_, text, kind, spoons, unclear) =>
    ai.expand(text, kind, spoons, unclear)
  )
  ipcMain.handle(IPC.profileGet, () => profiles.load())
  ipcMain.handle(IPC.profileSave, (_, p) => profiles.save(p))
  // The demo never shows onboarding: it reads as done, and the next save keeps it that way.
  ipcMain.handle(IPC.settingsGet, () => {
    const s = settings.load()
    return demo && !s.onboarding?.done
      ? { ...s, onboarding: { step: 'home', done: true, answers: {} } }
      : s
  })
  ipcMain.handle(IPC.settingsSave, (_, s) => {
    settings.save(s) // validates; an invalid save throws before the schedule re-arms
    onSettingsSaved()
  })
  ipcMain.handle(IPC.checkInList, () => checkIns.list())
  ipcMain.handle(IPC.checkInSave, (_, c) => {
    checkIns.add(c)
    try {
      learn()
    } catch {
      console.log('Pattern detection failed after a check-in.') // the check-in is saved either way
    }
  })
  ipcMain.handle(IPC.changeList, () => changes.list())
  ipcMain.handle(IPC.changeSave, (_, c) => changes.add(c))
  ipcMain.handle(IPC.achievementList, () => achievements.list())
  ipcMain.handle(IPC.achievementAdd, (_, a) => achievements.add(a))
  ipcMain.handle(IPC.eventLog, (_, e) => events.addFromRenderer(e))
  ipcMain.handle(IPC.eventList, () => events.list())
  ipcMain.handle(IPC.eventDelete, (_, id) => events.remove(id))
  ipcMain.handle(IPC.eventClear, () => events.clear())
  ipcMain.handle(IPC.learnedRefresh, () => learn())
  ipcMain.handle(IPC.summaryGenerate, (_, r, p) => ai.generateSummary(r, p))
  ipcMain.handle(IPC.onboardingDraft, (_, a) => ai.draftProfile(a))
  // Only the Mac simulates ⌘C through System Events; elsewhere capture needs no permission.
  ipcMain.handle(IPC.accessibility, (_, prompt) =>
    process.platform === 'darwin'
      ? systemPreferences.isTrustedAccessibilityClient(prompt === true)
      : null
  )
  ipcMain.handle(IPC.summaryExportPdf, () => api.exportSummaryPdf())
}

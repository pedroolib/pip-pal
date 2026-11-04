// shortcut: serves the fixture-backed mock over IPC. Replace one handler at a time with the real implementation.
import { join } from 'path'
import { app, ipcMain, systemPreferences } from 'electron'
import { IPC } from '@shared/ipc'
import { createMockApi } from '@shared/mock-api'
import { LEARN_WINDOW_DAYS, NoteMerge, NoteResolution, type Profile } from '@shared/schemas'
import { createClaudeClient, createJevClient, createTriageJevClient } from './ai/clients'
import { createDecoder } from './ai/decoder'
import { createExpander } from './ai/expand'
import { applyMerge, applyNote, createMerger, createRememberer } from './ai/lessons'
import { createProfileDrafter } from './ai/onboarding'
import { createSummarizer } from './ai/summary'
import { createTriager } from './ai/triage'
import { createAiHandlers } from './ai/index'
import { detectPatterns, mergeLearned } from './insights'
import { deleteReminder, saveReminder } from './reminders'
import type { Storage } from './storage'
import { createTranscriber, type Transcriber } from './transcribe'

let transcriber: Transcriber | null = null

/** Loads the speech model in the background; call it after registerMockHandlers. Never rejects. */
export function warmUpTranscriber(): Promise<void> {
  return transcriber ? transcriber.warmUp() : Promise.resolve()
}

export function registerMockHandlers(
  { demo, profiles, settings, checkIns, changes, achievements, events, lessons, reminders }: Storage,
  onSettingsSaved: () => void,
  /** Only the overlay records, so only it may transcribe. */
  isOverlay: (sender: Electron.WebContents) => boolean,
  onRemindersChanged: () => void
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
    makeExpander: () => createExpander({ claude: createClaudeClient(), lessons }),
    makeRememberer: () =>
      createRememberer({
        claude: createClaudeClient(),
        lessons,
        load: () => profiles.load(),
        save: (p) => profiles.save(p)
      }),
    makeMerger: () =>
      createMerger({
        claude: createClaudeClient(),
        lessons,
        load: () => profiles.load()
      }),
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
  ipcMain.handle(IPC.expand, (_, text, kind, spoons, unclear, correction) =>
    ai.expand(text, kind, spoons, unclear, correction)
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
  ipcMain.handle(IPC.lessonList, () => lessons.list())
  ipcMain.handle(IPC.lessonDelete, (_, id) => {
    if (typeof id !== 'string') throw new Error('A lesson is identified by its id.')
    lessons.replace(lessons.list().filter((l) => l.id !== id))
  })
  ipcMain.handle(IPC.noteRemember, (_, text, correction) => ai.rememberCorrection(text, correction))
  ipcMain.handle(IPC.noteResolve, (_, resolution) =>
    applyNote(lessons, NoteResolution.parse(resolution), new Date().toISOString())
  )
  ipcMain.handle(IPC.noteProposeMerges, () => ai.proposeMerges())
  ipcMain.handle(IPC.noteApplyMerge, (_, merge) =>
    applyMerge(lessons, NoteMerge.parse(merge), new Date().toISOString())
  )
  ipcMain.handle(IPC.reminderList, () => reminders.list())
  ipcMain.handle(IPC.reminderSave, (_, r) => {
    saveReminder(reminders, r)
    onRemindersChanged()
  })
  ipcMain.handle(IPC.reminderDelete, (_, id) => {
    deleteReminder(reminders, id)
    onRemindersChanged()
  })
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
  // electron-builder unpacks resources/** from the asar, so the packaged model sits beside it.
  const modelDir = app.isPackaged
    ? join(process.resourcesPath, 'app.asar.unpacked/resources/models')
    : join(app.getAppPath(), 'resources/models')
  const t = createTranscriber({ demo, modelDir, language: () => settings.load().language })
  transcriber = t
  ipcMain.handle(IPC.transcribe, (event, audio) => {
    if (!isOverlay(event.sender)) throw new Error("Only Pip's overlay can transcribe.")
    return t.transcribe(audio)
  })
}

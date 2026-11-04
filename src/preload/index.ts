import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type PipApi } from '@shared/ipc'

function on<T>(channel: string, cb: (value: T) => void): () => void {
  const listener = (_: IpcRendererEvent, value: T): void => cb(value)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: PipApi = {
  onCaptured: (cb) => on(IPC.captured, cb),
  onCheckInDue: (cb) => on(IPC.checkInDue, cb),
  decode: (text, spoons) => ipcRenderer.invoke(IPC.decode, text, spoons),
  triage: (text) => ipcRenderer.invoke(IPC.triage, text),
  expand: (text, kind, spoons, unclear, correction) =>
    ipcRenderer.invoke(IPC.expand, text, kind, spoons, unclear, correction),
  getProfile: () => ipcRenderer.invoke(IPC.profileGet),
  saveProfile: (profile) => ipcRenderer.invoke(IPC.profileSave, profile),
  getSettings: () => ipcRenderer.invoke(IPC.settingsGet),
  saveSettings: (settings) => ipcRenderer.invoke(IPC.settingsSave, settings),
  saveCheckIn: (checkIn) => ipcRenderer.invoke(IPC.checkInSave, checkIn),
  listCheckIns: () => ipcRenderer.invoke(IPC.checkInList),
  saveChange: (change) => ipcRenderer.invoke(IPC.changeSave, change),
  listChanges: () => ipcRenderer.invoke(IPC.changeList),
  addAchievement: (achievement) => ipcRenderer.invoke(IPC.achievementAdd, achievement),
  listAchievements: () => ipcRenderer.invoke(IPC.achievementList),
  logEvent: (e) => ipcRenderer.invoke(IPC.eventLog, e),
  listEvents: () => ipcRenderer.invoke(IPC.eventList),
  deleteEvent: (id) => ipcRenderer.invoke(IPC.eventDelete, id),
  clearEvents: () => ipcRenderer.invoke(IPC.eventClear),
  listLessons: () => ipcRenderer.invoke(IPC.lessonList),
  deleteLesson: (id) => ipcRenderer.invoke(IPC.lessonDelete, id),
  rememberCorrection: (text, correction) => ipcRenderer.invoke(IPC.noteRemember, text, correction),
  resolveNote: (resolution) => ipcRenderer.invoke(IPC.noteResolve, resolution),
  proposeMerges: () => ipcRenderer.invoke(IPC.noteProposeMerges),
  applyMerge: (merge) => ipcRenderer.invoke(IPC.noteApplyMerge, merge),
  refreshLearned: () => ipcRenderer.invoke(IPC.learnedRefresh),
  draftProfile: (answers) => ipcRenderer.invoke(IPC.onboardingDraft, answers),
  checkAccessibility: (prompt) => ipcRenderer.invoke(IPC.accessibility, prompt),
  generateSummary: (recipient, period) =>
    ipcRenderer.invoke(IPC.summaryGenerate, recipient, period),
  exportSummaryPdf: () => ipcRenderer.invoke(IPC.summaryExportPdf),
  openHome: () => ipcRenderer.send(IPC.homeOpen),
  setOverlayInteractive: (interactive) => ipcRenderer.send(IPC.overlayInteractive, interactive),
  setOverlayBounds: (bounds) => ipcRenderer.send(IPC.overlayBounds, bounds),
  onDismiss: (cb) => on<void>(IPC.dismiss, cb),
  setBubbleOpen: (open) => ipcRenderer.send(IPC.bubbleOpen, open),
  setOverlayFocus: (on) => ipcRenderer.send(IPC.overlayFocus, on),
  setCorner: (corner) => ipcRenderer.send(IPC.cornerSet, corner),
  onCorner: (cb) => on(IPC.corner, cb),
  clickCorner: () => ipcRenderer.send(IPC.cornerClick),
  onCornerOpen: (cb) => on<void>(IPC.cornerOpen, cb),
  onRecordHotkey: (cb) => on<void>(IPC.recordHotkey, cb),
  onCommand: (cb) => on(IPC.command, cb),
  setRecordingActive: (on) => ipcRenderer.send(IPC.recordingActive, on),
  listReminders: () => ipcRenderer.invoke(IPC.reminderList),
  saveReminder: (reminder) => ipcRenderer.invoke(IPC.reminderSave, reminder),
  deleteReminder: (id) => ipcRenderer.invoke(IPC.reminderDelete, id),
  onReminderDue: (cb) => on(IPC.reminderDue, cb),
  tellPip: (message) => ipcRenderer.invoke(IPC.tellPip, message),
  transcribe: (audio) => ipcRenderer.invoke(IPC.transcribe, audio)
}

contextBridge.exposeInMainWorld('api', api)

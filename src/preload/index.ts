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
  getProfile: () => ipcRenderer.invoke(IPC.profileGet),
  saveProfile: (profile) => ipcRenderer.invoke(IPC.profileSave, profile),
  saveCheckIn: (checkIn) => ipcRenderer.invoke(IPC.checkInSave, checkIn),
  listCheckIns: () => ipcRenderer.invoke(IPC.checkInList),
  saveChange: (change) => ipcRenderer.invoke(IPC.changeSave, change),
  listChanges: () => ipcRenderer.invoke(IPC.changeList),
  addAchievement: (achievement) => ipcRenderer.invoke(IPC.achievementAdd, achievement),
  listAchievements: () => ipcRenderer.invoke(IPC.achievementList),
  generateSummary: (recipient) => ipcRenderer.invoke(IPC.summaryGenerate, recipient),
  exportSummaryPdf: () => ipcRenderer.invoke(IPC.summaryExportPdf),
  openHome: () => ipcRenderer.send(IPC.homeOpen),
  setOverlayInteractive: (interactive) => ipcRenderer.send(IPC.overlayInteractive, interactive),
  setOverlayBounds: (bounds) => ipcRenderer.send(IPC.overlayBounds, bounds)
}

contextBridge.exposeInMainWorld('api', api)

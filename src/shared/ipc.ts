// The renderer only talks to main through `window.api` (PipApi). Channel names live here so main and preload agree.
import type {
  Achievement,
  ChangeEvent,
  CheckIn,
  Decoded,
  Profile,
  Recipient,
  Slot,
  Summary
} from './schemas'

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

/** Smallest overlay window: a card stays readable (includes the transparent p-8 around it). */
export const OVERLAY_MIN = { width: 320, height: 240 }

export const IPC = {
  /** main → overlay: text the person selected and sent with the hotkey. */
  captured: 'pip:captured',
  /** main → overlay: time for a spoons check-in. */
  checkInDue: 'pip:check-in-due',
  decode: 'pip:decode',
  profileGet: 'profile:get',
  profileSave: 'profile:save',
  checkInSave: 'check-in:save',
  checkInList: 'check-in:list',
  changeSave: 'change:save',
  changeList: 'change:list',
  achievementAdd: 'achievement:add',
  achievementList: 'achievement:list',
  summaryGenerate: 'summary:generate',
  summaryExportPdf: 'summary:export-pdf',
  homeOpen: 'home:open',
  /** overlay → main: whether the pointer is over Pip, so clicks elsewhere fall through to the app below. */
  overlayInteractive: 'overlay:interactive',
  /** overlay → main: move or resize the overlay window as the person drags a card, its edges or Pip. */
  overlayBounds: 'overlay:bounds'
} as const

export interface PipApi {
  /** Returns an unsubscribe function. */
  onCaptured(cb: (text: string) => void): () => void
  onCheckInDue(cb: (slot: Slot) => void): () => void
  /** `spoons` is the latest check-in, or null if none today. */
  decode(text: string, spoons: number | null): Promise<Decoded>
  getProfile(): Promise<Profile>
  saveProfile(profile: Profile): Promise<void>
  saveCheckIn(checkIn: CheckIn): Promise<void>
  listCheckIns(): Promise<CheckIn[]>
  saveChange(change: ChangeEvent): Promise<void>
  listChanges(): Promise<ChangeEvent[]>
  addAchievement(achievement: Achievement): Promise<void>
  listAchievements(): Promise<Achievement[]>
  generateSummary(recipient: Recipient): Promise<Summary>
  /** Prints the open summary to PDF; resolves to the saved path, or null if cancelled. */
  exportSummaryPdf(): Promise<string | null>
  openHome(): void
  /** Overlay only: true while the pointer is over a Pip surface; ignored from other windows. */
  setOverlayInteractive(interactive: boolean): void
  /** Overlay only: move/resize the window (screen px); main keeps it on screen and at least OVERLAY_MIN. */
  setOverlayBounds(bounds: Bounds): void
}

// The renderer only talks to main through `window.api` (PipApi). Channel names live here so main and preload agree.
import type {
  Achievement,
  ChangeEvent,
  CheckIn,
  Decoded,
  ActionKind,
  Expansion,
  Triage,
  Profile,
  Recipient,
  Slot,
  Summary,
  UnclearPart
} from './schemas'

export const IPC = {
  /** main → overlay: text the person selected and sent with the hotkey. */
  captured: 'pip:captured',
  /** main → overlay: time for a spoons check-in. */
  checkInDue: 'pip:check-in-due',
  decode: 'pip:decode',
  triage: 'pip:triage',
  expand: 'pip:expand',
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
  overlayInteractive: 'overlay:interactive'
} as const

export interface PipApi {
  /** Returns an unsubscribe function. */
  onCaptured(cb: (text: string) => void): () => void
  onCheckInDue(cb: (slot: Slot) => void): () => void
  /** `spoons` is the latest check-in, or null if none today. */
  /** Replaced by triage + expand once the UI migrates. */
  decode(text: string, spoons: number | null): Promise<Decoded>
  /** Jev only, on the hotkey; rejects if Jev fails. Never calls Claude. */
  triage(text: string): Promise<Triage>
  /** One Claude call, only when the person presses that button. Calls for different kinds can run in parallel. */
  /** `unclear`: the parts Jev flagged as unclear; used only for `questions`, at most 2, no duplicates. */
  expand(
    text: string,
    kind: ActionKind,
    spoons: number | null,
    unclear?: UnclearPart[]
  ): Promise<Expansion>
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
}

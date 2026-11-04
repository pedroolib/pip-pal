// The renderer only talks to main through `window.api` (PipApi). Channel names live here so main and preload agree.
import type {
  Achievement,
  ChangeEvent,
  CheckIn,
  Decoded,
  LoggableEvent,
  OnboardingAnswers,
  ActionKind,
  Expansion,
  Lesson,
  NoteMerge,
  NoteProposal,
  NoteResolution,
  NewReminder,
  Reminder,
  ReminderDelay,
  Triage,
  Profile,
  Recipient,
  Settings,
  Slot,
  Summary,
  SummaryPeriod,
  UnclearPart,
  UsageEvent
} from './schemas'

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

/**
 * The Pip waiting in the screen's bottom-right corner while a task is open: it holds whichever of
 * the bubble's buttons and the task card isn't at the cursor, and clicking it swaps the two.
 */
export interface CornerPip {
  holds: 'menu' | 'task'
  /** 0–1 while it holds a steps task, else null (no ring). */
  progress: number | null
}

/** Smallest overlay window: a card stays readable (includes the transparent p-8 around it). */
export const OVERLAY_MIN = { width: 320, height: 240 }

export const CORRECTION_MAX = 1000

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
  settingsGet: 'settings:get',
  settingsSave: 'settings:save',
  checkInSave: 'check-in:save',
  checkInList: 'check-in:list',
  changeSave: 'change:save',
  changeList: 'change:list',
  achievementAdd: 'achievement:add',
  achievementList: 'achievement:list',
  eventLog: 'event:log',
  eventList: 'event:list',
  eventDelete: 'event:delete',
  eventClear: 'event:clear',
  lessonList: 'lesson:list',
  lessonDelete: 'lesson:delete',
  noteRemember: 'note:remember',
  noteResolve: 'note:resolve',
  noteProposeMerges: 'note:propose-merges',
  noteApplyMerge: 'note:apply-merge',
  learnedRefresh: 'learned:refresh',
  onboardingDraft: 'onboarding:draft',
  accessibility: 'system:accessibility',
  summaryGenerate: 'summary:generate',
  summaryExportPdf: 'summary:export-pdf',
  homeOpen: 'home:open',
  /** main → overlay: a reminder is due (or came due while Pip was closed). */
  reminderDue: 'pip:reminder-due',
  reminderAdd: 'reminder:add',
  reminderReschedule: 'reminder:reschedule',
  reminderFinish: 'reminder:finish',
  reminderShow: 'reminder:show',
  reminderList: 'reminder:list',
  /** overlay → main: whether the pointer is over Pip, so clicks elsewhere fall through to the app below. */
  overlayInteractive: 'overlay:interactive',
  /** overlay → main: move or resize the overlay window as the person drags a card, its edges or Pip. */
  overlayBounds: 'overlay:bounds',
  /** main → overlay: close the open bubble (Esc or `pip-pal --dismiss`). */
  dismiss: 'pip:dismiss',
  /** overlay → main: whether the triage bubble is open; Esc is a global shortcut only while it is. */
  bubbleOpen: 'overlay:bubble-open',
  /** overlay → main: let the overlay take the keyboard while a record card that needs typing or Enter is open. */
  overlayFocus: 'overlay:focus',
  /** overlay → main: show the corner Pip holding this, or hide it (null). */
  cornerSet: 'overlay:corner',
  /** main → corner window: what the corner Pip holds, or null while hidden. */
  corner: 'corner:state',
  /** corner window → main → overlay: the person clicked the corner Pip. */
  cornerClick: 'corner:click',
  cornerOpen: 'overlay:corner-open',
  /** main → overlay: the record hotkey was pressed. */
  recordHotkey: 'pip:record-hotkey',
  /** overlay → main: audio in, transcript out; runs on this machine. */
  transcribe: 'pip:transcribe'
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
    unclear?: UnclearPart[],
    /** What the person typed after a wrong answer (scrubbed like the text, at most CORRECTION_MAX characters). */
    correction?: string
  ): Promise<Expansion>
  getProfile(): Promise<Profile>
  saveProfile(profile: Profile): Promise<void>
  getSettings(): Promise<Settings>
  saveSettings(settings: Settings): Promise<void>
  saveCheckIn(checkIn: CheckIn): Promise<void>
  listCheckIns(): Promise<CheckIn[]>
  saveChange(change: ChangeEvent): Promise<void>
  listChanges(): Promise<ChangeEvent[]>
  addAchievement(achievement: Achievement): Promise<void>
  listAchievements(): Promise<Achievement[]>
  /** Appends an event the cards report (asked, step, calm). Main assigns id and at, and rejects other kinds. */
  logEvent(e: LoggableEvent): Promise<void>
  /** Newest first is up to the caller; events older than EVENT_RETENTION_DAYS are already pruned. */
  listEvents(): Promise<UsageEvent[]>
  deleteEvent(id: string): Promise<void>
  clearEvents(): Promise<void>
  /** What the person taught Pip by correcting its answers (Settings shows it). */
  listLessons(): Promise<Lesson[]>
  deleteLesson(id: string): Promise<void>
  /**
   * After steps built on a correction: saves the person's words as a note, then one Claude call proposes what to
   * do with them. Null when there is nothing to show. Rejects with bad input.
   */
  rememberCorrection(text: string, correction: string): Promise<NoteProposal | null>
  resolveNote(resolution: NoteResolution): Promise<void>
  /** One Claude call, only when the person asks: which notes could become one. Changes nothing. */
  proposeMerges(): Promise<NoteMerge[]>
  applyMerge(merge: NoteMerge): Promise<void>
  /** Runs pattern detection; returns the profile with any new pending entries. */
  refreshLearned(): Promise<Profile>
  /**
   * One Claude call: Pip turns the onboarding answers (scrubbed) into suggestions with origin `onboarding`,
   * adds them to `pending` and returns the saved profile. Nothing else in the profile changes.
   * Rejects with no API key, offline or on an invalid answer; the renderer then keeps the person's own words.
   */
  draftProfile(answers: OnboardingAnswers): Promise<Profile>
  /** Mac: whether Pip may simulate ⌘C; `prompt` opens the system dialog. Null on other systems (none needed). */
  checkAccessibility(prompt: boolean): Promise<boolean | null>
  generateSummary(recipient: Recipient, period: SummaryPeriod): Promise<Summary>
  /** Prints the open summary to PDF; resolves to the saved path, or null if cancelled. */
  exportSummaryPdf(): Promise<string | null>
  /**
   * "Not now": Pip saves this and shows it again at the chosen time, even after a restart. The same kind
   * and source replaces the earlier one. Rejects with bad input.
   */
  addReminder(reminder: NewReminder, delay: ReminderDelay): Promise<Reminder>
  /** Picks a new time for a reminder (and gives it its nudges back). */
  rescheduleReminder(id: string, delay: ReminderDelay): Promise<void>
  /** Done, or opened: the reminder goes away. An unknown id does nothing. */
  finishReminder(id: string): Promise<void>
  /** Shows a parked (or waiting) reminder now. */
  showReminder(id: string): Promise<void>
  listReminders(): Promise<Reminder[]>
  /** `missed`: it came due while Pip was closed or asleep. Returns an unsubscribe function. */
  onReminderDue(cb: (reminder: Reminder, missed: boolean) => void): () => void
  openHome(): void
  /** Overlay only: true while the pointer is over a Pip surface; ignored from other windows. */
  setOverlayInteractive(interactive: boolean): void
  /** Overlay only: move/resize the window (screen px); main keeps it on screen and at least OVERLAY_MIN. */
  setOverlayBounds(bounds: Bounds): void
  /** Returns an unsubscribe function. */
  onDismiss(cb: () => void): () => void
  /** Overlay only: tell main the bubble opened or closed; ignored from other windows. */
  setBubbleOpen(open: boolean): void
  /** Overlay only: ignored from other windows. */
  setOverlayFocus(on: boolean): void
  /** Overlay only: show the corner Pip holding this, or hide it (null); ignored from other windows. */
  setCorner(corner: CornerPip | null): void
  /** Corner window: what to show. Returns an unsubscribe function. */
  onCorner(cb: (corner: CornerPip | null) => void): () => void
  /** Corner window only: the person clicked the corner Pip. */
  clickCorner(): void
  /** Overlay: the corner Pip was clicked, so swap the cursor's card with it. Returns an unsubscribe function. */
  onCornerOpen(cb: () => void): () => void
  /** Each press opens the source card, or stops the recording if one is running. Returns an unsubscribe function. */
  onRecordHotkey(cb: () => void): () => void
  /**
   * `audio`: 16 kHz mono, at most RECORD_MAX_MS + 5 s. Transcribed on this machine; nothing leaves it.
   * Rejects on bad input or failure. With PIP_DEMO=1 it falls back to the scripted transcript on failure
   * or after TRANSCRIBE_TIMEOUT_MS.
   */
  transcribe(audio: Float32Array): Promise<string>
}

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
  Triage,
  Profile,
  Recipient,
  Reminder,
  Settings,
  Slot,
  Summary,
  SummaryPeriod,
  TellAnswer,
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
  /** main → overlay: `pip-pal --record` was run, or the command was pressed during a recording. */
  recordHotkey: 'pip:record-hotkey',
  /** main → overlay: the command shortcut was pressed. */
  command: 'pip:command',
  /** main → overlay: the command shortcut was pressed and Pip is still reading the selection. */
  commandStart: 'pip:command-start',
  /** overlay → main: whether a recording is running, so the shortcut can tell. */
  recordingActive: 'overlay:recording-active',
  /** overlay → main: it has subscribed, so what main sends from now on reaches it. */
  overlayReady: 'overlay:ready',
  /** overlay → main: a selection arrived with typed text in a card; nothing happens, so undo the press. */
  selectionRefused: 'overlay:selection-refused',
  reminderList: 'reminder:list',
  reminderSave: 'reminder:save',
  reminderDelete: 'reminder:delete',
  /** main → overlay: a reminder's time has come. */
  reminderDue: 'pip:reminder-due',
  /** overlay → main: something the person typed or dictated to Pip and sent. */
  tellPip: 'pip:tell',
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
  /**
   * `pip-pal --record` (opens the source card, or stops the recording) and the command pressed during a recording
   * (stops it). The shortcut pressed with no selection on an open record card arrives through `onCommand`. Returns an
   * unsubscribe function.
   */
  onRecordHotkey(cb: () => void): () => void
  /**
   * The command shortcut was pressed. `copyFailed`: Pip found nothing selected, so the overlay shows the menu
   * with its could-not-read line. Returns an unsubscribe function.
   */
  onCommand(cb: (e: { copyFailed: boolean }) => void): () => void
  /**
   * The command shortcut was pressed on a closed overlay, before the selection is read: the overlay shows the menu
   * at once, and `onCommand` (nothing selected) or `onCaptured` (text) then settles it. Returns an unsubscribe function.
   */
  onCommandStart(cb: () => void): () => void
  /** Overlay only: whether a recording is running; ignored from other windows. */
  setRecordingActive(on: boolean): void
  /** Overlay only, once its page has subscribed and again after a reload: main then sends what it held back. */
  overlayReady(): void
  /** Overlay only: it ignored a selection to keep typed text, so main puts the window and the keyboard back. */
  refuseSelection(): void
  listReminders(): Promise<Reminder[]>
  /** Creates, or updates the one with the same id. Rejects with bad input or past REMINDER_MAX; see REMINDER_ERROR. */
  saveReminder(reminder: Reminder): Promise<void>
  deleteReminder(id: string): Promise<void>
  /** A reminder's time came (or passed while Pip was off). Returns an unsubscribe function. */
  onReminderDue(cb: (reminder: Reminder) => void): () => void
  /**
   * Text the person typed or dictated and pressed Send on. One Claude call (scrubbed): a reply, why, and what
   * to do with their words as a note. Their words are saved first; if the call fails `reply` is null and the
   * note keeps them. Overlay only. Rejects with bad input, in which case nothing was saved.
   */
  tellPip(message: string): Promise<TellAnswer>
  /**
   * `audio`: 16 kHz mono, at most RECORD_MAX_MS + 5 s. Transcribed on this machine; nothing leaves it.
   * Rejects on bad input or failure. With PIP_DEMO=1 it falls back to the scripted transcript on failure
   * or after TRANSCRIBE_TIMEOUT_MS.
   */
  transcribe(audio: Float32Array): Promise<string>
}

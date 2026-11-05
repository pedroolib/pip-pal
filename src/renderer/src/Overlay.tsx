// The overlay: check-in → triage bubble next to the cursor (Esc closes it) → hidden until the hotkey.
// A bubble button opens its task card; tucked away (or Esc), Pip floats there until it's closed.
// Each button has its own card and Claude call, so the calls run side by side; one card shows at a
// time. While a card is open a Pip in the screen's corner keeps the bubble's buttons (or the card,
// when the buttons are at the cursor): clicking it swaps the two. Back on a card does the same, and
// tucking the card away (or Esc) leaves it in that corner Pip.
// The command with nothing selected opens the menu; due reminders wait here until Pip is hidden.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CORRECTION_MAX, OVERLAY_MIN, type Bounds } from '@shared/ipc'
import {
  DEFAULT_SETTINGS,
  dueCheckIn,
  hotkeyReady,
  enabledTimes,
  type Achievement,
  type ActionKind,
  type Expansion,
  type LoggableEvent,
  type NoteProposal,
  type QuestionTopic,
  type Reminder,
  type Triage
} from '@shared/schemas'
import { api, inBrowser } from '@renderer/api'
import { CheckInCard } from '@renderer/checkin/CheckInCard'
import { CommandMenu, type CommandItem } from '@renderer/command/CommandMenu'
import { addDue, refreshDue } from '@renderer/command/dueQueue'
import { ReminderDueCard } from '@renderer/command/ReminderDueCard'
import { ReminderForm } from '@renderer/command/ReminderForm'
import { TellCard } from '@renderer/command/TellCard'
import { CornerButton } from '@renderer/corner/CornerPip'
import { SNOOZE_MS, slotFor, spoonsToday } from '@renderer/checkin/model'
import { cutAfterLow, cutAfterUnstick, moodDue, moodLevel } from '@renderer/mood/model'
import { planSteps } from '@renderer/decode/model'
import { ExpandView, type Stuck } from '@renderer/expand/ExpandView'
import { ResizeEdges } from '@renderer/overlay/ResizeEdges'
import { useFitFont } from '@renderer/overlay/useFitFont'
import { useWindowDrag } from '@renderer/overlay/useWindowDrag'
import { cn } from '@renderer/lib/utils'
import { applySettings } from '@renderer/house/settings'
import { TriageBubble } from '@renderer/triage/TriageBubble'
import { BUBBLE_WIDTH, CARD_RESERVE, unclearParts, type Flip } from '@renderer/triage/model'
import { previewTriage } from '@renderer/triage/samples'
import { RecordFlow } from '@renderer/record/RecordFlow'
import { isPaused, pausePref, usePaused } from '@renderer/pause'

// `?spoons=2` in the URL skips the check-in in a plain browser.
function spoonsOverride(): number | null {
  const v = Number(new URLSearchParams(location.search).get('spoons'))
  return Number.isInteger(v) && v >= 1 && v <= 5 ? v : null
}

// 'hidden' draws nothing; the click-through window then lets every click reach the app below.
// 'task' is what a bubble button opened; while cards are open, the corner Pip holds the other one.
// 'record' is the voice capture flow; its transcript goes to the same triage.
// 'menu' is what the command opens with nothing selected; 'tell' and 'remind' are two of its choices.
// 'due' is a reminder whose time came: it waits for 'hidden' and never takes the keyboard.
type View = 'checkIn' | 'triage' | 'task' | 'record' | 'menu' | 'tell' | 'remind' | 'due' | 'hidden'
// These open next to the cursor at their design size, with the window fitted to them.
const FITTED: (View | null)[] = ['triage', 'task', 'record', 'menu', 'tell', 'remind', 'due']
// These stay unseen until the window has grown to them, so no card shows clipped, or with its buttons arriving late.
// Not the triage bubble: it reserves its room up front.
const HIDE_WHILE_FITTING: (View | null)[] = ['task', 'record', 'tell', 'remind', 'due', 'menu']
// Esc closes these. Not the due card: it stays until answered.
const ESCAPES: (View | null)[] = ['triage', 'task', 'menu', 'tell', 'remind']
// A scheduled check-in or a corner click would throw these away: a recording, or what the person is writing.
const HOLDS_WORK: (View | null)[] = ['record', 'tell', 'remind']

/** A bubble button's task: its one Claude call, the spoons it was made with and where the person is. */
type Task = {
  spoons: number | null
  result: Expansion | null
  error: boolean
  /** Index of the step in progress (steps only); kept here so tucking the card away keeps it. */
  step: number
  /** "I'm stuck" on the current step, until its smaller steps take its place (steps only). */
  stuck: Stuck | null
  /** "I have a plan" was pressed (transition only). */
  planned: boolean
  /** A drafted question was copied; logged as an achievement once per card. */
  asked: boolean
  /** Questions copied or steps left for later that are already in the log: each counts once. */
  logged: string[]
  /** What the person added after a wrong answer, kept across retries and further corrections. */
  correction: string
  /** The part of `correction` not yet saved as a note: it waits for a valid answer. */
  toRemember: string
  /** What Pip proposes to remember, waiting for a tap. */
  note: NoteProposal | null
  /** Mid-task "How are you feeling?" (steps only): 'ask' shows the faces, a number is the face just picked. */
  mood: 'ask' | number | null
  /** Pip already asked on this list of steps: it asks once, halfway through. */
  moodAsked: boolean
  /** After a low mood only this many steps from the start stay visible; the rest can wait (steps only). */
  cut: number | null
}
type Tasks = Partial<Record<ActionKind, Task>>

const NEW_TASK: Task = {
  spoons: null,
  result: null,
  error: false,
  step: 0,
  stuck: null,
  planned: false,
  asked: false,
  logged: [],
  correction: '',
  toRemember: '',
  note: null,
  mood: null,
  moodAsked: false,
  cut: null
}

// A failed write only loses the log entry; the flow goes on.
function logAchievement(kind: Achievement['kind'], label: string): void {
  api.addAchievement({ at: new Date().toISOString(), kind, label }).catch(() => {})
}
function logEvent(event: LoggableEvent): void {
  api.logEvent(event).catch(() => {})
}

// The window's transparent padding around the bubble (p-[32px] below). The window is sized to
// BUBBLE_WIDTH, not measured, so a window that starts too narrow can't keep the card squeezed.
const PAD = 32
// How far the bubble opens from the cursor; keep in step with capture() in src/main/index.ts.
const CURSOR_GAP = 12
// The check-in's window: wide and short, since it is a row of faces; keep in step with OVERLAY in src/main/index.ts.
const CHECKIN_SIZE = { width: 640, height: 280 }

// Window bounds that keep `anchor`'s edges still (right/bottom when flipped). After a drag there is
// no anchor, so the same edges stay wherever the person left the window.
function placeAt(
  anchor: { x: number; y: number } | null,
  flip: Flip,
  width: number,
  height: number
): Bounds {
  const a = anchor ?? {
    x: flip.x ? screenX + innerWidth : screenX,
    y: flip.y ? screenY + innerHeight : screenY
  }
  return { x: flip.x ? a.x - width : a.x, y: flip.y ? a.y - height : a.y, width, height }
}

function Overlay(): React.JSX.Element {
  const { t } = useTranslation()
  const drag = useWindowDrag()
  const [view, setView] = useState<View | null>(null)
  const [triage, setTriage] = useState<Triage | null>(null)
  const [error, setError] = useState(false)
  // Once a bubble has opened at the cursor, Pip docks where it was instead of in the screen corner.
  const [atCursor, setAtCursor] = useState(false)
  const [flip, setFlip] = useState<Flip>({ x: false, y: false })
  const [tasks, setTasks] = useState<Tasks>({})
  // The card on screen (or that the corner Pip reopens).
  const [active, setActive] = useState<ActionKind | null>(null)
  const [copyFailed, setCopyFailed] = useState(false)
  // The check-in was opened from the menu: it takes the keyboard, and "Not now" just closes it.
  const [onDemand, setOnDemand] = useState(false)
  // A scheduled check-in the menu or an open card held back: it comes back when Pip is hidden.
  const [checkInWaits, setCheckInWaits] = useState(false)
  // Due reminders, oldest first; the first one is on the card.
  const [dueQueue, setDueQueue] = useState<Reminder[]>([])
  // The step text when the reminder form came from a step card's clock.
  const [fromStep, setFromStep] = useState<string | null>(null)
  // Reminders set from a step's clock on this message. A new message empties it, and so does a restart.
  const [stepReminders, setStepReminders] = useState<string[]>([])
  // Tell the subscribe-once handlers what is open.
  const viewNow = useRef<View | null>(null)
  const onDemandNow = useRef(false)
  const readingNow = useRef(false)
  useEffect(() => {
    viewNow.current = view
    readingNow.current = view === 'triage' && !triage && !error
    onDemandNow.current = onDemand
  }, [view, onDemand, triage, error])
  // The selected text, for the button's Claude call. Stays in this window.
  const text = useRef('')
  // The window edges next to the cursor (left/top, or right/bottom when flipped), kept still while
  // the bubble resizes so Pip doesn't move; null once the person drags the bubble elsewhere.
  const anchor = useRef<{ x: number; y: number } | null>(null)
  const request = useRef(0)
  const snooze = useRef<ReturnType<typeof setTimeout> | null>(null)
  const frame = useRef<HTMLDivElement>(null)
  const resized = useRef(false)
  // The view the window has taken the size of, so it can show (see HIDE_WHILE_FITTING). Tied to the view itself, so
  // a stale flag can never leave a card hidden.
  const [fittedView, setFittedView] = useState<View | null>(null)
  const fitted = fittedView === view
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the next appearance waits for its own fit
    if (view === 'hidden') setFittedView(null)
  }, [view])
  // The check-in card fills the window and its text is sized to fit it.
  useFitFont(frame, view === 'checkIn', view)
  // The bubble keeps its design size: the window is fitted to it, not the other way round, so the
  // window-based root size (main.css) must not scale it.
  useLayoutEffect(() => {
    if (!FITTED.includes(view)) return
    document.documentElement.style.fontSize = '16px'
    // The window is resized to a new card a moment after it renders; the page must not flash a scrollbar meanwhile.
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.documentElement.style.fontSize = ''
      document.documentElement.style.overflow = ''
    }
  }, [view])

  // House and overlay are separate windows: re-read settings whenever Pip appears or the window
  // gains focus, so a change made in the House shows up here. A failed read keeps the current state.
  const refreshSettings = (): void => {
    api.getSettings().then(applySettings, () => {})
  }

  // Main put the window's top-left next to the cursor, so the cursor can be read back from it.
  // The bubble opens left and/or up when the card wouldn't fit right of or below the cursor.
  const openAtCursor = (): void => {
    const cursor = { x: screenX + PAD - CURSOR_GAP, y: screenY + PAD - CURSOR_GAP }
    const area = screen as Screen & { availLeft: number; availTop: number }
    const f = {
      x: cursor.x + CURSOR_GAP + BUBBLE_WIDTH > area.availLeft + area.availWidth,
      y: cursor.y + CURSOR_GAP + CARD_RESERVE > area.availTop + area.availHeight
    }
    anchor.current = {
      x: f.x ? cursor.x - CURSOR_GAP + PAD : cursor.x + CURSOR_GAP - PAD,
      y: f.y ? cursor.y - CURSOR_GAP + PAD : cursor.y + CURSOR_GAP - PAD
    }
    setFlip(f)
    setAtCursor(true)
  }
  // What the person wrote in the open card, which a press of the command or --record must not lose.
  const hasTyped = (): boolean =>
    [...(frame.current?.querySelectorAll('textarea') ?? [])].some((field) => field.value.trim())
  // `here`: text from the record flow opens where that flow already sits.
  const capture = (selected: string, here = false): void => {
    if (!here && hasTyped()) return api.refuseSelection() // what they typed would be lost
    refreshSettings()
    const id = ++request.current
    text.current = selected
    setTasks({})
    setActive(null)
    setStepReminders([])
    if (!here) openAtCursor()
    setTriage(null)
    setError(false)
    setView('triage')
    // In a plain browser `?triage=<sample>` stands in for the hotkey's selection (see samples.ts).
    const preview = inBrowser && previewTriage(new URLSearchParams(location.search).get('triage'))
    ;(preview || api.triage(selected))
      .then((result) => id === request.current && setTriage(result))
      .catch(() => id === request.current && setError(true))
  }
  const patch = (kind: ActionKind, change: (task: Task) => Partial<Task>): void =>
    setTasks((all) => {
      const task = all[kind]
      return task ? { ...all, [kind]: { ...task, ...change(task) } } : all
    })
  // `inPlace`: Pip is already reading at the cursor, so the menu opens where it is: the window has moved and
  // grown since, and reading the cursor back from it again would put Pip on another side of the card.
  const openMenu = (failed: boolean, inPlace = false): void => {
    refreshSettings()
    setCopyFailed(failed)
    if (!inPlace) openAtCursor()
    setView('menu')
  }
  // Nothing selected. Main left the window alone if a card holds the keyboard, else moved it to the cursor.
  const onCommand = ({ copyFailed: failed }: { copyFailed: boolean }): void => {
    const now = viewNow.current
    if (now === 'record') return // RecordFlow listens too
    if (now === 'menu') return setView('hidden')
    if (hasTyped()) return
    if (now === 'checkIn' && !onDemandNow.current) setCheckInWaits(true)
    openMenu(failed, readingNow.current)
  }
  // The press, before the selection is read: Pip appears reading, as in a triage; capture or onCommand then replaces it.
  const onCommandStart = (): void => {
    if (viewNow.current !== 'hidden') return
    request.current++ // an older read must not fill this one
    openAtCursor()
    setTriage(null)
    setError(false)
    setView('triage')
  }
  // `pip-pal --record` opens the source card at the cursor; once open, RecordFlow handles it.
  const openRecord = (): void => {
    if (viewNow.current === 'record' || hasTyped()) return
    refreshSettings()
    openAtCursor()
    setView('record')
  }
  // After an error, read the same selection again; the bubble stays where it is.
  const retryTriage = (): void => {
    const id = ++request.current
    setError(false)
    setTriage(null)
    api
      .triage(text.current)
      .then((result) => id === request.current && setTriage(result))
      .catch(() => id === request.current && setError(true))
  }
  // One Claude call per button, only once it's pressed (spoons from today's check-in). Pressing it
  // again reopens its card; after an error it tries again.
  const act = (kind: ActionKind, added?: string): void => {
    setActive(kind)
    setView('task')
    if (tasks[kind] && !tasks[kind].error && !added) return
    const id = request.current
    const live = (): boolean => id === request.current
    const unclear = kind === 'questions' && triage ? unclearParts(triage) : undefined
    // shortcut: past the limit the oldest words drop, even mid-sentence; keep notes short if long chains get common.
    const join = (prev: string | undefined): string =>
      [prev, added].filter(Boolean).join('\n').slice(-CORRECTION_MAX)
    const correction = join(tasks[kind]?.correction)
    const toRemember = join(tasks[kind]?.toRemember)
    const source = text.current
    setTasks((all) => ({ ...all, [kind]: { ...NEW_TASK, correction, toRemember } }))
    api
      .listCheckIns()
      .catch(() => [])
      .then((checkIns) => {
        const spoons = spoonsOverride() ?? spoonsToday(checkIns, new Date())
        if (live()) patch(kind, () => ({ spoons }))
        return api
          .expand(text.current, kind, spoons, unclear, correction || undefined)
          .then((result) => {
            const asking = result.kind === 'steps' && !!result.needsContext
            // Outside the live check: closing the card must not lose what the person taught Pip.
            if (toRemember && !asking)
              api.rememberCorrection(source, toRemember).then(
                (note) => live() && patch(kind, () => ({ note, toRemember: '' })),
                () => {} // only the proposal is lost if the words were saved
              )
            if (!live()) return
            patch(kind, () => ({ result }))
          })
      })
      .catch(() => live() && patch(kind, () => ({ error: true })))
  }
  // The corner Pip trades places with what's at the cursor: the open card and the bubble's buttons.
  // From a tucked-away card (hidden), it brings the card back.
  const swap = (): void =>
    setView((v) =>
      v === 'checkIn' || HOLDS_WORK.includes(v) ? v : v === 'task' ? 'triage' : 'task'
    )
  // Nothing opens by itself in the app: after the check-in Pip hides and waits for the hotkey.
  const afterCheckIn = (): void => (inBrowser ? capture('') : setView('hidden'))

  useEffect(() => {
    // A failed settings read means "ask at the default times".
    const settings = api.getSettings().catch(() => null)
    settings.then((s) => s && applySettings(s))
    Promise.all([api.listCheckIns(), settings]).then(([checkIns, s]) => {
      // Ask at launch only if the latest enabled time that passed today is unanswered (main's rule);
      // after "Not now" it asks once more later.
      const due = dueCheckIn(enabledTimes(s ?? DEFAULT_SETTINGS), checkIns, new Date())
      // Quiet until onboarding reaches its practice step, like main (the browser mock has no onboarding).
      const quiet = !inBrowser && !!s && !hotkeyReady(s.onboarding)
      // In a plain browser these stand in for what the command and the schedule do.
      const asked = new URLSearchParams(location.search)
      if (inBrowser && asked.get('record')) openRecord()
      else if (inBrowser && asked.get('menu')) openMenu(false)
      else if (inBrowser && (asked.get('tell') || asked.get('remind'))) {
        openAtCursor()
        setView(asked.get('tell') ? 'tell' : 'remind')
      } else if (inBrowser && asked.get('due')) {
        const at = new Date(Date.now() - 60_000).toISOString()
        const sample = { id: 'sample-due', text: 'Send Priya the slides', at }
        api.saveReminder(sample).then(() => {
          setDueQueue([sample])
          setView('hidden')
        })
      } else if (spoonsOverride() !== null || !due || quiet || isPaused(pausePref.get()))
        afterCheckIn()
      else {
        setOnDemand(false)
        setView('checkIn')
      }
    })
    const offCaptured = api.onCaptured(capture)
    const offCorner = api.onCornerOpen(swap)
    const offRecord = api.onRecordHotkey(openRecord)
    const offCommand = api.onCommand(onCommand)
    const offCommandStart = api.onCommandStart(onCommandStart)
    const offReminderDue = api.onReminderDue((r) => setDueQueue((q) => addDue(q, r)))
    window.addEventListener('focus', refreshSettings)
    const offDue = api.onCheckInDue(() => {
      if (isPaused(pausePref.get())) return // paused: Pip does not ask
      refreshSettings()
      if (viewNow.current === 'menu' || HOLDS_WORK.includes(viewNow.current)) {
        return setCheckInWaits(true)
      }
      setAtCursor(false)
      setOnDemand(false)
      setView('checkIn')
    })
    api.overlayReady() // only now: what main sends before this is lost
    return () => {
      offCaptured()
      offCorner()
      offRecord()
      offCommand()
      offCommandStart()
      offReminderDue()
      offDue()
      window.removeEventListener('focus', refreshSettings)
      if (snooze.current) clearTimeout(snooze.current)
    }
    // Subscribe once: the handlers only use state setters and refs, which never go stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // While the bubble or a card is open Esc closes it. With cards open nothing is lost: they wait in
  // the corner Pip and their calls keep going. The overlay is never focused, so main sends a dismiss
  // when it catches Escape (or a second launch with --dismiss); the keydown is for a plain browser.
  const hasTask = Object.keys(tasks).length > 0
  const checkInOnDemand = view === 'checkIn' && onDemand
  const stepForm = view === 'remind' && fromStep !== null
  useEffect(() => {
    if (!ESCAPES.includes(view) && !checkInOnDemand) return
    api.setBubbleOpen(true)
    const close = (): void => {
      if (!hasTask) request.current++ // a late answer must not reopen what was closed
      // The menu's own cards (and the check-in it opened) go back to it; the menu itself closes.
      const fromMenu = view === 'tell' || view === 'remind' || checkInOnDemand
      setView(stepForm ? 'task' : fromMenu ? 'menu' : 'hidden')
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    const offDismiss = api.onDismiss(close)
    // Capture: a card's own Esc handler can commit the next view before the event gets back up to
    // the window, and that view's listener would then close it too.
    window.addEventListener('keydown', onKey, true)
    return () => {
      api.setBubbleOpen(false)
      offDismiss()
      window.removeEventListener('keydown', onKey, true)
    }
  }, [view, hasTask, checkInOnDemand, stepForm])

  // A check-in the person asked for by keyboard must answer to the keyboard; a scheduled one never takes it.
  useEffect(() => {
    if (!checkInOnDemand) return
    api.setOverlayFocus(true)
    frame.current?.querySelector<HTMLElement>('[data-slot=card] button')?.focus()
    return () => api.setOverlayFocus(false)
  }, [checkInOnDemand])

  // Once Pip is hidden, what waited comes up, one at a time: the check-in first, then the oldest reminder.
  // Re-listed first, because a reminder may have been edited or deleted in the House while it waited.
  // While paused nothing comes up by itself; reminders keep waiting and arrive once Pip resumes.
  const [paused] = usePaused()
  useEffect(() => {
    if (view !== 'hidden' || paused) return
    if (checkInWaits) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- moving on from 'hidden' is what this effect is for
      setCheckInWaits(false)
      setAtCursor(false)
      setOnDemand(false)
      setView('checkIn')
      return
    }
    if (dueQueue.length === 0) return
    let live = true
    const show = (): void => setView((v) => (v === 'hidden' ? 'due' : v))
    api.listReminders().then(
      (listed) => {
        if (!live) return
        const fresh = refreshDue(dueQueue, listed, new Date())
        setDueQueue(fresh)
        if (fresh.length > 0) show()
      },
      () => live && show() // a failed read must not hide what is due
    )
    return () => {
      live = false
    }
  }, [view, checkInWaits, dueQueue, paused])

  // The window is fitted to the bubble, keeping its edges at the cursor; hidden, it shrinks back;
  // the check-in gets its own size back only if Pip resized the window (else a first launch or a
  // snooze re-open would move it, or undo a size the person dragged).
  // While Jev reads, the window already makes room for the card: main keeps the window on screen, so
  // growing it only when the answer arrives would push Pip up or left near a screen edge.
  // The same goes for a task card while Claude works on it.
  const task = active ? tasks[active] : undefined
  const reading =
    (view === 'triage' && !triage && !error) ||
    (view === 'task' && !!task && !task.result && !task.error)
  useEffect(() => {
    const el = frame.current
    if (view === 'checkIn' && resized.current) {
      resized.current = false
      api.setOverlayBounds({ x: screenX, y: screenY, ...CHECKIN_SIZE })
    }
    if (view === 'hidden' && atCursor) {
      resized.current = true
      api.setOverlayBounds(placeAt(anchor.current, flip, OVERLAY_MIN.width, OVERLAY_MIN.height))
    }
    if (!FITTED.includes(view) || !el) return
    // Shows the view once the window has the size sent to it: on its resize, or at once if it already had it, or
    // after a moment if main kept the window smaller (a screen edge).
    let stopWaiting = (): void => {}
    let waiting = false
    const settle = (width: number, height: number): void => {
      if (waiting) return
      waiting = true
      const done = (): void => {
        stopWaiting()
        setFittedView(view)
      }
      const onResize = (): void => {
        if (Math.abs(innerWidth - width) <= 1 && Math.abs(innerHeight - height) <= 1) done()
      }
      const timer = setTimeout(done, 160)
      const raf = requestAnimationFrame(onResize)
      window.addEventListener('resize', onResize)
      stopWaiting = (): void => {
        clearTimeout(timer)
        cancelAnimationFrame(raf)
        window.removeEventListener('resize', onResize)
        waiting = false
        stopWaiting = (): void => {}
      }
    }
    const fit = (): void => {
      resized.current = true
      const height =
        Math.max(Math.ceil(el.getBoundingClientRect().height), reading ? CARD_RESERVE : 0) + 2 * PAD
      const width = BUBBLE_WIDTH + 2 * PAD
      api.setOverlayBounds(placeAt(anchor.current, flip, width, height))
      settle(width, height)
    }
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    return () => {
      observer.disconnect()
      stopWaiting()
    }
  }, [view, atCursor, reading, flip])

  // While cards are open the corner Pip holds whichever of the open card and the buttons isn't at
  // the cursor, with the steps' progress ring when it holds the steps card.
  const stepsTask = tasks.steps
  const steps =
    stepsTask?.result?.kind === 'steps'
      ? planSteps(stepsTask.result.steps, stepsTask.spoons, stepsTask.cut).now
      : null
  const holds = !hasTask ? null : view === 'task' ? 'menu' : 'task'
  const cornerProgress =
    holds === 'task' && active === 'steps' && stepsTask && steps?.length
      ? Math.min(stepsTask.step / steps.length, 1)
      : null
  useEffect(() => {
    if (!inBrowser) api.setCorner(holds && { holds, progress: cornerProgress })
  }, [holds, cornerProgress])
  // A plain browser has no corner window, so the page draws that Pip in its own corner.
  const cornerInPage = inBrowser && holds && (
    <div className="fixed right-7 bottom-7">
      <CornerButton holding={{ holds, progress: cornerProgress }} onOpen={swap} />
    </div>
  )

  if (!view || view === 'hidden') return <>{cornerInPage}</>

  const answer = (n: number): void => {
    const at = new Date()
    api.saveCheckIn({ at: at.toISOString(), slot: slotFor(at), spoons: n })
    if (onDemand) setView('hidden')
    else afterCheckIn()
  }
  // Asks once more later, then leaves it: Pip never insists.
  const snoozeCheckIn = (): void => {
    setView('hidden')
    if (snooze.current) return
    snooze.current = setTimeout(() => {
      if (viewNow.current === 'due') return setCheckInWaits(true) // the card being read stays
      if (viewNow.current !== 'hidden') return
      setOnDemand(false)
      setView('checkIn')
    }, SNOOZE_MS)
  }

  const corner = view === 'checkIn'
  const bubble = !corner
  // Closing a card drops it; with other cards still open the bubble comes back and the corner Pip
  // holds the next one.
  const closeTask = (): void => {
    if (!active) return
    const rest = (Object.keys(tasks) as ActionKind[]).filter((k) => k !== active)
    setTasks((all) => {
      const next = { ...all }
      delete next[active]
      return next
    })
    setActive(rest[0] ?? null)
    setView(rest.length > 0 && triage ? 'triage' : 'hidden')
  }
  // Logs once per text, so copying a question twice or saving a reminder twice for a step counts one.
  const logOnce = (kind: ActionKind, text: string, event: LoggableEvent): void => {
    if (tasks[kind]?.logged.includes(text)) return
    logEvent(event)
    patch(kind, (x) => ({ logged: [...x.logged, text] }))
  }
  // The step card's clock: the reminder form with the step's text. Cancel goes back to the card.
  const remindLater = (): void => {
    const left = stepsTask && steps?.[stepsTask.step]
    if (!left) return
    setFromStep(left.text)
    setView('remind')
  }
  const reminderSaved = (reminder: Reminder): void => {
    if (fromStep !== null) {
      logOnce('steps', fromStep, { kind: 'step', status: 'can_wait', text: fromStep })
      setStepReminders((ids) => [...ids, reminder.id])
    }
    setView('hidden')
  }
  // The general menu is view 'menu' (CommandMenu); its cards come back to it instead of closing Pip.
  const backToMenu = (): void => setView('menu')
  const pick = (item: CommandItem): void => {
    if (item === 'home') {
      api.openHome()
      setView('hidden')
    } else if (item === 'listen') {
      refreshSettings()
      setView('record')
    } else if (item === 'checkIn') {
      setCheckInWaits(false)
      setOnDemand(true)
      setView('checkIn')
    } else {
      setFromStep(null)
      setView(item)
    }
  }
  const dropDue = (id: string): void => {
    setDueQueue((q) => q.filter((r) => r.id !== id))
    setView((v) => (v === 'due' ? 'hidden' : v)) // the person may have opened something during the save
  }
  const dueDone = async (id: string): Promise<void> => {
    await api.deleteReminder(id)
    dropDue(id)
  }
  // Read again first: saving a reminder deleted in the House meanwhile would bring it back.
  const dueLater = async (id: string, at: string): Promise<void> => {
    const stored = (await api.listReminders()).find((r) => r.id === id)
    if (stored) await api.saveReminder({ ...stored, at })
    dropDue(id)
  }
  // Going back to the step answers the reminder: left stored, it would fire again at the next launch,
  // with no step to go back to. A failed delete only means that happens.
  const dueBack = (id: string): void => {
    api.deleteReminder(id).catch(() => {})
    setDueQueue((q) => q.filter((r) => r.id !== id))
    setActive('steps')
    setView('task')
  }
  // "I'm stuck": Pip breaks the current step into smaller ones that take its place. The done steps drop, so with
  // few spoons the small steps are the ones on show. If that hinges on something only the person knows, Pip asks
  // first: each answer joins the next call and, once Pip can answer, may become a note. Also the retry after an error.
  const unstick = (answer?: string): void => {
    const task = tasks.steps
    const step = task?.stuck?.step ?? (task && steps?.[task.step]?.text)
    if (!task || !step) return
    const said = [task.stuck?.answer, answer].filter(Boolean).join('\n').slice(-CORRECTION_MAX)
    const id = request.current
    const live = (): boolean => id === request.current
    const source = text.current
    const stuck = (status: Stuck['status'], question = ''): Partial<Task> => ({
      stuck: { step, answer: said, status, question }
    })
    patch('steps', () => stuck('working'))
    api.unstick(source, step, task.spoons, said || undefined).then(
      (result) => {
        // Outside the live check: closing the card must not lose what the person taught Pip.
        if (said && !result.needsContext)
          api.rememberCorrection(source, said).then(
            (note) => live() && patch('steps', () => ({ note })),
            () => {} // only the proposal is lost if the words were saved
          )
        if (!live()) return
        const question = result.needsContext
        if (question) return patch('steps', () => stuck('asking', question))
        patch('steps', (x) => {
          if (x.result?.kind !== 'steps') return { stuck: null }
          const { profileUsed, lessonsUsed } = x.result
          const merged = {
            ...x.result,
            steps: [...result.steps, ...x.result.steps.slice(x.step + 1)],
            profileUsed: [
              ...profileUsed,
              ...result.profileUsed.filter((p) => !profileUsed.some((q) => q.how === p.how))
            ],
            lessonsUsed: [...new Set([...lessonsUsed, ...result.lessonsUsed])]
          }
          return {
            result: merged,
            step: 0,
            stuck: null,
            cut: cutAfterUnstick(x.cut, x.step, result.steps.length),
            // A new list has its own halfway for "how are you feeling?".
            mood: null,
            moodAsked: false
          }
        })
      },
      () => live() && patch('steps', () => stuck('error'))
    )
  }
  const stepDone = (): void => {
    const done = stepsTask && steps?.[stepsTask.step]
    if (done) {
      logAchievement('step_done', done.text)
      logEvent({ kind: 'step', status: 'done', text: done.text })
    }
    // Once, halfway through the steps, Pip asks how the person feels.
    patch('steps', (x) => {
      const done = x.step + 1
      const ask = moodDue({ total: steps?.length ?? 0, done, asked: x.moodAsked })
      return { step: done, ...(ask && { mood: 'ask', moodAsked: true }) }
    })
  }
  // The faces count as a check-in: they feed the day's energy and what Pip learns about calming. A low answer
  // keeps the next few steps and moves the rest to "can wait"; a high one just goes on.
  const moodAnswer = (spoons: number | null): void => {
    if (spoons === null) return patch('steps', () => ({ mood: null }))
    const at = new Date()
    api.saveCheckIn({ at: at.toISOString(), slot: slotFor(at), spoons }).catch(() => {})
    patch('steps', (x) => ({
      mood: moodLevel(spoons) === 'high' ? null : spoons,
      ...(moodLevel(spoons) === 'low' && { cut: cutAfterLow(x.step, x.cut) })
    }))
  }
  const copied = (kind: ActionKind, what: string, question: string, topic: QuestionTopic): void => {
    logOnce(kind, question, { kind: 'asked', topic, question })
    if (tasks[kind]?.asked) return
    logAchievement('asked_not_guessed', t('achievement.asked', { what }))
    patch(kind, () => ({ asked: true }))
  }
  const planned = (kind: ActionKind): void => {
    const type = triage?.changeType ?? 'other'
    const label =
      type === 'none' || type === 'other'
        ? t('achievement.changeAny')
        : t('achievement.change', { type: t(`decode.changeTypes.${type}`) })
    const at = new Date().toISOString()
    logAchievement('change_navigated', label)
    api.saveChange({ at, type, summary: label }).catch(() => {})
    patch(kind, () => ({ planned: true }))
  }

  return (
    <div
      data-overlay-root
      data-flip-y={(bubble && flip.y) || undefined}
      className={cn(
        'flex h-screen p-[32px]',
        corner || (bubble && flip.y) ? 'items-end' : 'items-start',
        (corner || (bubble && flip.x)) && 'justify-end'
      )}
    >
      {/* Drag any card or Pip to move the overlay, or the check-in's edge to resize it. */}
      <div
        {...drag}
        onPointerDown={(e) => {
          // Selecting text in a field must not drag the overlay.
          if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement)
            return
          anchor.current = null // a drag moves the bubble away from the cursor
          drag.onPointerDown(e)
        }}
        ref={frame}
        // The card's rise-in starts once the window has grown to it (main.css), so it plays whole instead of cut off.
        data-hold={(HIDE_WHILE_FITTING.includes(view) && !fitted) || undefined}
        className={cn(
          'relative flex flex-col select-none',
          !corner && 'place-hold',
          corner ? 'max-h-full w-full items-end' : 'w-fit max-w-full',
          view === 'checkIn' &&
            'h-full [&>[data-slot=card]]:flex-1 [&>[data-slot=card]]:justify-between'
        )}
      >
        {view === 'checkIn' && <ResizeEdges />}
        {view === 'checkIn' && (
          <CheckInCard
            onAnswer={answer}
            onSnooze={onDemand ? backToMenu : snoozeCheckIn}
          />
        )}
        {view === 'menu' && (
          <CommandMenu flip={flip} copyFailed={copyFailed} onPick={pick} onClose={() => setView('hidden')} />
        )}
        {view === 'tell' && <TellCard flip={flip} onClose={backToMenu} />}
        {view === 'remind' && (
          <ReminderForm
            initialText={fromStep ?? ''}
            flip={flip}
            onSaved={reminderSaved}
            onCancel={() => (fromStep !== null ? setView('task') : backToMenu())}
          />
        )}
        {view === 'due' && dueQueue[0] && (
          <ReminderDueCard
            key={dueQueue[0].id}
            reminder={dueQueue[0]}
            canGoBack={!!tasks.steps && stepReminders.includes(dueQueue[0].id)}
            more={dueQueue.length - 1}
            onDone={() => dueDone(dueQueue[0].id)}
            onLater={(at) => dueLater(dueQueue[0].id, at)}
            onBack={() => dueBack(dueQueue[0].id)}
          />
        )}
        {view === 'triage' && (
          <TriageBubble
            triage={triage}
            error={error}
            flip={flip}
            onAction={act}
            onRetry={retryTriage}
          />
        )}
        {view === 'record' && (
          <RecordFlow
            flip={flip}
            onRead={(said) => capture(said, true)}
            onClose={backToMenu}
          />
        )}
        {view === 'task' && active && task && (
          <div style={{ width: BUBBLE_WIDTH }}>
            <ExpandView
              kind={active}
              expansion={task.result}
              error={task.error}
              spoons={task.spoons}
              step={task.step}
              deadline={triage?.deadline ?? null}
              planned={task.planned}
              asked={task.asked}
              mood={task.mood}
              cut={task.cut}
              onMood={moodAnswer}
              onMoodDone={() => patch(active, () => ({ mood: null }))}
              onKeepAll={() => patch(active, () => ({ cut: null }))}
              onStepDone={stepDone}
              onLater={remindLater}
              onCorrect={(added) => act(active, added)}
              note={task.note}
              onNoteDone={() => patch(active, () => ({ note: null }))}
              stuck={task.stuck}
              onStuck={unstick}
              onStuckCancel={() => patch(active, () => ({ stuck: null }))}
              onCopied={(what, question, topic) => copied(active, what, question, topic)}
              onPlanned={() => planned(active)}
              onBack={triage ? () => setView('triage') : undefined}
              onRetry={() => act(active)}
              onMinimize={() => setView('hidden')}
              onClose={closeTask}
            />
          </div>
        )}
      </div>
      {cornerInPage}
    </div>
  )
}

export default Overlay

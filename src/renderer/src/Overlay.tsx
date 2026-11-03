// The overlay: check-in → triage bubble next to the cursor (Esc closes it) → hidden until the hotkey.
// A bubble button opens its task card; tucked away (or Esc), Pip floats there until it's closed.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { OVERLAY_MIN, type Bounds } from '@shared/ipc'
import {
  DEFAULT_SETTINGS,
  dueCheckIn,
  enabledTimes,
  type ActionKind,
  type Expansion,
  type Triage
} from '@shared/schemas'
import { api, inBrowser } from '@renderer/api'
import { CheckInCard } from '@renderer/checkin/CheckInCard'
import { SNOOZE_MS, slotFor, spoonsToday } from '@renderer/checkin/model'
import { planSteps } from '@renderer/decode/model'
import { ExpandView } from '@renderer/expand/ExpandView'
import { ResizeEdges } from '@renderer/overlay/ResizeEdges'
import { useFitFont } from '@renderer/overlay/useFitFont'
import { useWindowDrag } from '@renderer/overlay/useWindowDrag'
import { cn } from '@renderer/lib/utils'
import { applySettings } from '@renderer/house/settings'
import { DockedPip } from '@renderer/pip/DockedPip'
import { TriageBubble } from '@renderer/triage/TriageBubble'
import { BUBBLE_WIDTH, CARD_RESERVE, unclearParts, type Flip } from '@renderer/triage/model'
import { previewTriage } from '@renderer/triage/samples'

// `?spoons=2` in the URL skips the check-in in a plain browser.
function spoonsOverride(): number | null {
  const v = Number(new URLSearchParams(location.search).get('spoons'))
  return Number.isInteger(v) && v >= 1 && v <= 5 ? v : null
}

// 'hidden' draws nothing; the click-through window then lets every click reach the app below.
// 'task' is what a bubble button opened; 'docked' is Pip floating while that task stays open.
type View = 'checkIn' | 'triage' | 'task' | 'docked' | 'hidden'

/** A bubble button's task: its one Claude call and the spoons it was made with. */
type Task = { kind: ActionKind; spoons: number | null; result: Expansion | null; error: boolean }

// The window's transparent padding around the bubble (p-[32px] below). The window is sized to
// BUBBLE_WIDTH, not measured, so a window that starts too narrow can't keep the card squeezed.
const PAD = 32
// How far the bubble opens from the cursor; keep in step with capture() in src/main/index.ts.
const CURSOR_GAP = 12
// The check-in's window; keep in step with OVERLAY in src/main/index.ts.
const CHECKIN_SIZE = { width: 448, height: 400 }

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
  const drag = useWindowDrag()
  const [view, setView] = useState<View | null>(null)
  const [triage, setTriage] = useState<Triage | null>(null)
  const [error, setError] = useState(false)
  // Once a bubble has opened at the cursor, Pip docks where it was instead of in the screen corner.
  const [atCursor, setAtCursor] = useState(false)
  const [flip, setFlip] = useState<Flip>({ x: false, y: false })
  const [task, setTask] = useState<Task | null>(null)
  // Index of the step in progress; kept here so tucking the card away doesn't lose it.
  const [step, setStep] = useState(0)
  // The selected text, for the button's Claude call. Stays in this window.
  const text = useRef('')
  // The window edges next to the cursor (left/top, or right/bottom when flipped), kept still while
  // the bubble resizes so Pip doesn't move; null once the person drags the bubble elsewhere.
  const anchor = useRef<{ x: number; y: number } | null>(null)
  // True while the latest check-in time is unanswered (dueCheckIn's rule): the docked Pip then reopens it on click.
  const unanswered = useRef(false)
  const request = useRef(0)
  const snooze = useRef<ReturnType<typeof setTimeout> | null>(null)
  const frame = useRef<HTMLDivElement>(null)
  const resized = useRef(false)
  // The check-in card fills the window and its text is sized to fit it.
  useFitFont(frame, view === 'checkIn', view)
  // The bubble keeps its design size: the window is fitted to it, not the other way round, so the
  // window-based root size (main.css) must not scale it.
  useLayoutEffect(() => {
    if (view !== 'triage' && view !== 'task') return
    document.documentElement.style.fontSize = '16px'
    return () => {
      document.documentElement.style.fontSize = ''
    }
  }, [view])

  // House and overlay are separate windows: re-read settings whenever Pip appears or the window
  // gains focus, so a change made in the House shows up here. A failed read keeps the current state.
  const refreshSettings = (): void => {
    api.getSettings().then(applySettings, () => {})
  }

  const capture = (selected: string): void => {
    refreshSettings()
    const id = ++request.current
    text.current = selected
    setTask(null)
    // Main put the window's top-left next to the cursor, so the cursor can be read back from it.
    // The bubble opens left and/or up when the card wouldn't fit right of or below the cursor.
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
    setTriage(null)
    setError(false)
    setView('triage')
    // In a plain browser `?triage=<sample>` stands in for the hotkey's selection (see samples.ts).
    const preview = inBrowser && previewTriage(new URLSearchParams(location.search).get('triage'))
    ;(preview || api.triage(selected))
      .then((result) => id === request.current && setTriage(result))
      .catch(() => id === request.current && setError(true))
  }
  // One Claude call, only now that the person pressed the button (spoons from today's check-in).
  const act = (kind: ActionKind): void => {
    const id = ++request.current
    const unclear = kind === 'questions' && triage ? unclearParts(triage) : undefined
    setTask({ kind, spoons: null, result: null, error: false })
    setStep(0)
    setView('task')
    api
      .listCheckIns()
      .catch(() => [])
      .then((checkIns) => {
        const spoons = spoonsOverride() ?? spoonsToday(checkIns, new Date())
        if (id === request.current) setTask((t) => t && { ...t, spoons })
        return api.expand(text.current, kind, spoons, unclear)
      })
      .then((result) => id === request.current && setTask((t) => t && { ...t, result }))
      .catch(() => id === request.current && setTask((t) => t && { ...t, error: true }))
  }
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
      unanswered.current = spoonsOverride() === null && !!due
      if (spoonsOverride() !== null || !due) afterCheckIn()
      else setView('checkIn')
    })
    const offCaptured = api.onCaptured(capture)
    window.addEventListener('focus', refreshSettings)
    const offDue = api.onCheckInDue(() => {
      unanswered.current = true // "Not now" then leaves the docked Pip able to reopen it
      refreshSettings()
      setAtCursor(false)
      setView('checkIn')
    })
    return () => {
      offCaptured()
      offDue()
      window.removeEventListener('focus', refreshSettings)
      if (snooze.current) clearTimeout(snooze.current)
    }
    // Subscribe once: the handlers only use state setters and refs, which never go stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // While the bubble is open Esc closes it, and Pip hides; Esc on a task card only tucks it away, so
  // Pip floats there to bring the person back. The overlay is never focused, so main sends a dismiss
  // when it catches Escape (or a second launch with --dismiss); the keydown is for a plain browser.
  useEffect(() => {
    if (view !== 'triage' && view !== 'task') return
    api.setBubbleOpen(true)
    const close = (): void => {
      if (view === 'task') {
        setView('docked') // the call keeps going; Pip shows when it's ready
        return
      }
      request.current++ // a late answer must not reopen what was closed
      setView('hidden')
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    const offDismiss = api.onDismiss(close)
    window.addEventListener('keydown', onKey)
    return () => {
      api.setBubbleOpen(false)
      offDismiss()
      window.removeEventListener('keydown', onKey)
    }
  }, [view])

  // The window is fitted to the bubble, keeping its edges at the cursor; docked or hidden, it shrinks back;
  // the check-in gets its own size back only if Pip resized the window (else a first launch or a
  // snooze re-open would move it, or undo a size the person dragged).
  // While Jev reads, the window already makes room for the card: main keeps the window on screen, so
  // growing it only when the answer arrives would push Pip up or left near a screen edge.
  // The same goes for a task card while Claude works on it.
  const reading =
    (view === 'triage' && !triage && !error) ||
    (view === 'task' && !!task && !task.result && !task.error)
  useEffect(() => {
    const el = frame.current
    if (view === 'checkIn' && resized.current) {
      resized.current = false
      api.setOverlayBounds({ x: screenX, y: screenY, ...CHECKIN_SIZE })
    }
    if ((view === 'docked' || view === 'hidden') && atCursor) {
      resized.current = true
      api.setOverlayBounds(placeAt(anchor.current, flip, OVERLAY_MIN.width, OVERLAY_MIN.height))
    }
    if ((view !== 'triage' && view !== 'task') || !el) return
    const fit = (): void => {
      resized.current = true
      const height =
        Math.max(Math.ceil(el.getBoundingClientRect().height), reading ? CARD_RESERVE : 0) + 2 * PAD
      api.setOverlayBounds(placeAt(anchor.current, flip, BUBBLE_WIDTH + 2 * PAD, height))
    }
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    return () => observer.disconnect()
  }, [view, atCursor, reading, flip])

  if (!view || view === 'hidden') return <></>

  const answer = (n: number): void => {
    const at = new Date()
    api.saveCheckIn({ at: at.toISOString(), slot: slotFor(at), spoons: n })
    unanswered.current = false
    afterCheckIn()
  }
  // Asks once more later, then leaves it: Pip never insists.
  const snoozeCheckIn = (): void => {
    setView('hidden')
    if (snooze.current) return
    snooze.current = setTimeout(() => setView((v) => (v === 'hidden' ? 'checkIn' : v)), SNOOZE_MS)
  }

  const corner = view === 'checkIn' || (view === 'docked' && !atCursor)
  const bubble = !corner
  const steps =
    task?.result?.kind === 'steps' ? planSteps(task.result.steps, task.spoons).now : null
  const closeTask = (): void => {
    setTask(null)
    setView('hidden')
  }

  return (
    <div
      data-overlay-root
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
          anchor.current = null // a drag moves the bubble away from the cursor
          drag.onPointerDown(e)
        }}
        ref={frame}
        className={cn(
          'relative flex flex-col select-none',
          corner ? 'max-h-full w-full items-end' : 'w-fit max-w-full',
          view === 'checkIn' &&
            'h-full [&>[data-slot=card]]:flex-1 [&>[data-slot=card]]:justify-between'
        )}
      >
        {view === 'checkIn' && <ResizeEdges />}
        {view === 'checkIn' && <CheckInCard onAnswer={answer} onSnooze={snoozeCheckIn} />}
        {view === 'triage' && (
          <TriageBubble triage={triage} error={error} flip={flip} onAction={act} />
        )}
        {view === 'task' && task && (
          <div style={{ width: BUBBLE_WIDTH }}>
            <ExpandView
              kind={task.kind}
              expansion={task.result}
              error={task.error}
              spoons={task.spoons}
              step={step}
              deadline={triage?.deadline ?? null}
              onStepDone={() => setStep((s) => s + 1)}
              onAsk={() => act('questions')}
              onMinimize={() => setView('docked')}
              onClose={closeTask}
            />
          </div>
        )}
        {view === 'docked' && (
          <DockedPip
            mood={task && !task.result && !task.error ? 'thinking' : 'calm'}
            progress={steps?.length ? Math.min(step / steps.length, 1) : null}
            doneStep={steps && step > 0 ? Math.min(step, steps.length) : null}
            onOpen={() => {
              if (task) setView('task')
              else if (triage || error) setView('triage')
              else if (unanswered.current) setView('checkIn')
            }}
          />
        )}
      </div>
    </div>
  )
}

export default Overlay

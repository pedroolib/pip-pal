// The overlay: check-in → triage bubble next to the cursor (Esc closes it) → hidden until the hotkey.
// A bubble button opens its task card; tucked away (or Esc), Pip floats there until it's closed.
// Each button has its own card and Claude call, so the calls run side by side and Back returns to
// the bubble's other buttons; one card shows at a time.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { OVERLAY_MIN, type Bounds } from '@shared/ipc'
import {
  DEFAULT_SETTINGS,
  LOW_SPOONS,
  dueCheckIn,
  enabledTimes,
  type Achievement,
  type ActionKind,
  type CalmingStrategy,
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
import {
  BUBBLE_WIDTH,
  CARD_RESERVE,
  PIP_SIZE,
  unclearParts,
  type Flip
} from '@renderer/triage/model'
import { previewTriage } from '@renderer/triage/samples'

// `?spoons=2` in the URL skips the check-in in a plain browser.
function spoonsOverride(): number | null {
  const v = Number(new URLSearchParams(location.search).get('spoons'))
  return Number.isInteger(v) && v >= 1 && v <= 5 ? v : null
}

// 'hidden' draws nothing; the click-through window then lets every click reach the app below.
// 'task' is what a bubble button opened; 'docked' is Pip floating while that task stays open.
type View = 'checkIn' | 'triage' | 'task' | 'docked' | 'hidden'

/** A bubble button's task: its one Claude call, the spoons it was made with and where the person is. */
type Task = {
  spoons: number | null
  result: Expansion | null
  error: boolean
  /** Index of the step in progress (steps only); kept here so tucking the card away keeps it. */
  step: number
  calm: CalmingStrategy | null
  /** "I have a plan" was pressed (transition only). */
  planned: boolean
  /** A drafted question was copied; logged as an achievement once per card. */
  asked: boolean
}
type Tasks = Partial<Record<ActionKind, Task>>

const NEW_TASK: Task = {
  spoons: null,
  result: null,
  error: false,
  step: 0,
  calm: null,
  planned: false,
  asked: false
}

// A failed write only loses the log entry; the flow goes on.
function logAchievement(kind: Achievement['kind'], label: string): void {
  api.addAchievement({ at: new Date().toISOString(), kind, label }).catch(() => {})
}

// The window's transparent padding around the bubble (p-[32px] below). The window is sized to
// BUBBLE_WIDTH, not measured, so a window that starts too narrow can't keep the card squeezed.
const PAD = 32
// How far the bubble opens from the cursor; keep in step with capture() in src/main/index.ts.
const CURSOR_GAP = 12
// "Not now" on the steps card brings it back once, this much later, if it's still tucked away.
const LATER_MS = 15 * 60 * 1000
// Docked Pips in a column: each is PIP_SIZE tall, its progress ring reaches 10 px past it.
const DOCK_GAP = 24
const RING_OVERFLOW = 10
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
  const { t } = useTranslation()
  const drag = useWindowDrag()
  const [view, setView] = useState<View | null>(null)
  const [triage, setTriage] = useState<Triage | null>(null)
  const [error, setError] = useState(false)
  // Once a bubble has opened at the cursor, Pip docks where it was instead of in the screen corner.
  const [atCursor, setAtCursor] = useState(false)
  const [flip, setFlip] = useState<Flip>({ x: false, y: false })
  const [tasks, setTasks] = useState<Tasks>({})
  // The card on screen (or that the docked Pip reopens).
  const [active, setActive] = useState<ActionKind | null>(null)
  // A calming strategy is offered at most once per message, so Pip doesn't insist.
  const calmOffered = useRef(false)
  // The selected text, for the button's Claude call. Stays in this window.
  const text = useRef('')
  // The window edges next to the cursor (left/top, or right/bottom when flipped), kept still while
  // the bubble resizes so Pip doesn't move; null once the person drags the bubble elsewhere.
  const anchor = useRef<{ x: number; y: number } | null>(null)
  // True while the latest check-in time is unanswered (dueCheckIn's rule): the docked Pip then reopens it on click.
  const unanswered = useRef(false)
  const request = useRef(0)
  const snooze = useRef<ReturnType<typeof setTimeout> | null>(null)
  const later = useRef<ReturnType<typeof setTimeout> | null>(null)
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
    setTasks({})
    setActive(null)
    calmOffered.current = false
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
  const patch = (kind: ActionKind, change: (task: Task) => Partial<Task>): void =>
    setTasks((all) => {
      const task = all[kind]
      return task ? { ...all, [kind]: { ...task, ...change(task) } } : all
    })
  // With few spoons, or before a plan for a change, Pip offers the manual's first calming strategy.
  const offerCalm = (kind: ActionKind, spoons: number | null, live: () => boolean): void => {
    const low = spoons !== null && spoons <= LOW_SPOONS
    if (calmOffered.current || kind === 'questions' || !(low || kind === 'transition')) return
    calmOffered.current = true
    api.getProfile().then(
      (p) => {
        const strategy = p.calmingStrategies[0]
        if (strategy && live()) patch(kind, () => ({ calm: strategy }))
      },
      () => {}
    )
  }
  // One Claude call per button, only once it's pressed (spoons from today's check-in). Pressing it
  // again reopens its card; after an error it tries again.
  const act = (kind: ActionKind): void => {
    setActive(kind)
    setView('task')
    if (tasks[kind] && !tasks[kind].error) return
    const id = request.current
    const live = (): boolean => id === request.current
    const unclear = kind === 'questions' && triage ? unclearParts(triage) : undefined
    setTasks((all) => ({ ...all, [kind]: NEW_TASK }))
    api
      .listCheckIns()
      .catch(() => [])
      .then((checkIns) => {
        const spoons = spoonsOverride() ?? spoonsToday(checkIns, new Date())
        if (live()) patch(kind, () => ({ spoons }))
        return api.expand(text.current, kind, spoons, unclear).then((result) => {
          if (!live()) return
          patch(kind, () => ({ result }))
          offerCalm(kind, spoons, live)
        })
      })
      .catch(() => live() && patch(kind, () => ({ error: true })))
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
      if (later.current) clearTimeout(later.current)
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
      // A card is open, or the bubble was reached with Back: the calls keep going and the docked
      // Pip brings the card back.
      if (view === 'task' || active) {
        setView('docked')
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
  }, [view, active])

  // The window is fitted to the bubble, keeping its edges at the cursor; docked or hidden, it shrinks back;
  // the check-in gets its own size back only if Pip resized the window (else a first launch or a
  // snooze re-open would move it, or undo a size the person dragged).
  // While Jev reads, the window already makes room for the card: main keeps the window on screen, so
  // growing it only when the answer arrives would push Pip up or left near a screen edge.
  // The same goes for a task card while Claude works on it.
  const task = active ? tasks[active] : undefined
  // One docked Pip per open card, in the bubble's button order.
  const order = triage?.actions.map((a) => a.kind) ?? []
  const docked = (Object.entries(tasks) as [ActionKind, Task][]).sort(
    ([a], [b]) => order.indexOf(a) - order.indexOf(b)
  )
  const dockHeight =
    docked.length * PIP_SIZE + Math.max(docked.length - 1, 0) * DOCK_GAP + 2 * RING_OVERFLOW
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
      const height = Math.max(OVERLAY_MIN.height, dockHeight + 2 * PAD)
      api.setOverlayBounds(placeAt(anchor.current, flip, OVERLAY_MIN.width, height))
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
  }, [view, atCursor, reading, flip, dockHeight])

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
  const stepsTask = tasks.steps
  const steps =
    stepsTask?.result?.kind === 'steps'
      ? planSteps(stepsTask.result.steps, stepsTask.spoons).now
      : null
  // Closing a card drops it; the bubble comes back while other cards are still open.
  const closeTask = (): void => {
    if (!active) return
    const rest = Object.keys(tasks).filter((k) => k !== active)
    setTasks((all) => {
      const next = { ...all }
      delete next[active]
      return next
    })
    setActive(null)
    setView(rest.length > 0 && triage ? 'triage' : 'hidden')
  }
  const remindLater = (): void => {
    setView('docked')
    if (later.current) clearTimeout(later.current)
    const id = request.current
    later.current = setTimeout(() => {
      later.current = null
      // A new message, or a card closed meanwhile, wins: Pip never insists.
      if (id !== request.current) return
      setActive('steps')
      setView((v) => (v === 'docked' ? 'task' : v))
    }, LATER_MS)
  }
  const stepDone = (): void => {
    const done = stepsTask && steps?.[stepsTask.step]
    if (done) logAchievement('step_done', done.text)
    patch('steps', (x) => ({ step: x.step + 1 }))
  }
  const copied = (kind: ActionKind, what: string): void => {
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
        {view === 'task' && active && task && (
          <div style={{ width: BUBBLE_WIDTH }}>
            <ExpandView
              kind={active}
              expansion={task.result}
              error={task.error}
              spoons={task.spoons}
              step={task.step}
              deadline={triage?.deadline ?? null}
              calm={task.calm}
              planned={task.planned}
              asked={task.asked}
              onCalm={(calm) => patch(active, () => ({ calm }))}
              onStepDone={stepDone}
              onLater={remindLater}
              onAsk={() => act('questions')}
              onCopied={(what) => copied(active, what)}
              onPlanned={() => planned(active)}
              onBack={triage ? () => setView('triage') : undefined}
              onMinimize={() => setView('docked')}
              onClose={closeTask}
            />
          </div>
        )}
        {view === 'docked' && docked.length === 0 && (
          <DockedPip
            mood="calm"
            progress={null}
            doneStep={null}
            onOpen={() => {
              if (triage || error) setView('triage')
              else if (unanswered.current) setView('checkIn')
            }}
          />
        )}
        {view === 'docked' && docked.length > 0 && (
          <div
            className={cn(
              'flex gap-6',
              flip.y ? 'flex-col-reverse' : 'flex-col',
              flip.x ? 'items-end' : 'items-start'
            )}
            style={{ padding: RING_OVERFLOW - 2 }}
          >
            {docked.map(([kind, x]) => {
              const total = kind === 'steps' ? (steps?.length ?? 0) : 0
              const finished = x.planned || (total > 0 && x.step >= total)
              return (
                <DockedPip
                  key={kind}
                  kind={kind}
                  label={t('dock.openCard', { action: t(`bubble.actions.${kind}`) })}
                  active={kind === active && docked.length > 1}
                  mood={
                    x.error
                      ? 'gentle'
                      : !x.result
                        ? 'thinking'
                        : finished
                          ? 'happy'
                          : x.asked
                            ? 'thanks'
                            : 'calm'
                  }
                  progress={total > 0 ? Math.min(x.step / total, 1) : null}
                  doneStep={total > 0 && x.step > 0 ? Math.min(x.step, total) : null}
                  onOpen={() => {
                    setActive(kind)
                    setView('task')
                  }}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default Overlay

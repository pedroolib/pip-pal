// The overlay: check-in → triage bubble next to the cursor (Esc closes it) → Pip docked.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CheckIn, Triage } from '@shared/schemas'
import { api, inBrowser } from '@renderer/api'
import { CheckInCard } from '@renderer/checkin/CheckInCard'
import { SNOOZE_MS, slotFor } from '@renderer/checkin/model'
import { ResizeEdges } from '@renderer/overlay/ResizeEdges'
import { useFitFont } from '@renderer/overlay/useFitFont'
import { useWindowDrag } from '@renderer/overlay/useWindowDrag'
import { cn } from '@renderer/lib/utils'
import { applySettings, slotOn } from '@renderer/house/settings'
import { DockedPip } from '@renderer/pip/DockedPip'
import { TriageBubble } from '@renderer/triage/TriageBubble'
import { BUBBLE_WIDTH } from '@renderer/triage/model'
import { previewTriage } from '@renderer/triage/samples'

// `?spoons=2` in the URL skips the check-in in a plain browser.
function spoonsOverride(): number | null {
  const v = Number(new URLSearchParams(location.search).get('spoons'))
  return Number.isInteger(v) && v >= 1 && v <= 5 ? v : null
}

function todaysSpoons(checkIns: CheckIn[]): number | null {
  const today = new Date().toDateString()
  const latest = checkIns
    .filter((c) => new Date(c.at).toDateString() === today)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .at(-1)
  return latest?.spoons ?? null
}

type View = 'checkIn' | 'triage' | 'docked'

// The window's transparent padding around the bubble (p-[32px] below). The window is sized to
// BUBBLE_WIDTH, not measured, so a window that starts too narrow can't keep the card squeezed.
const PAD = 32
// The check-in's window; keep in step with OVERLAY in src/main/index.ts.
const CHECKIN_SIZE = { width: 448, height: 400 }

function Overlay(): React.JSX.Element {
  const drag = useWindowDrag()
  const [view, setView] = useState<View | null>(null)
  const [triage, setTriage] = useState<Triage | null>(null)
  const [error, setError] = useState(false)
  // Once a bubble has opened at the cursor, Pip docks where it was instead of in the screen corner.
  const [atCursor, setAtCursor] = useState(false)
  const checkedIn = useRef(false)
  const request = useRef(0)
  const snooze = useRef<ReturnType<typeof setTimeout> | null>(null)
  const frame = useRef<HTMLDivElement>(null)
  const resized = useRef(false)
  // The check-in card fills the window and its text is sized to fit it.
  useFitFont(frame, view === 'checkIn', view)
  // The bubble keeps its design size: the window is fitted to it, not the other way round, so the
  // window-based root size (main.css) must not scale it.
  useLayoutEffect(() => {
    if (view !== 'triage') return
    document.documentElement.style.fontSize = '16px'
    return () => {
      document.documentElement.style.fontSize = ''
    }
  }, [view])

  const capture = (text: string): void => {
    const id = ++request.current
    setAtCursor(true)
    setTriage(null)
    setError(false)
    setView('triage')
    // In a plain browser `?triage=<sample>` stands in for the hotkey's selection (see samples.ts).
    const preview = inBrowser && previewTriage(new URLSearchParams(location.search).get('triage'))
    ;(preview || api.triage(text))
      .then((result) => id === request.current && setTriage(result))
      .catch(() => id === request.current && setError(true))
  }
  // Nothing opens by itself in the app: after the check-in Pip docks and waits for the hotkey.
  const afterCheckIn = (): void => (inBrowser ? capture('') : setView('docked'))

  useEffect(() => {
    // A failed settings read means "ask as usual".
    const settings = api.getSettings().catch(() => null)
    settings.then((s) => s && applySettings(s))
    Promise.all([api.listCheckIns(), settings]).then(([checkIns, s]) => {
      checkedIn.current = spoonsOverride() !== null || todaysSpoons(checkIns) !== null
      // No launch-time ask when settings turned this slot off; the docked Pip still opens it on click.
      if (checkedIn.current || (s && !slotOn(s, new Date()))) afterCheckIn()
      else setView('checkIn')
    })
    const offCaptured = api.onCaptured(capture)
    const offDue = api.onCheckInDue(() => {
      setAtCursor(false)
      setView('checkIn')
    })
    return () => {
      offCaptured()
      offDue()
      if (snooze.current) clearTimeout(snooze.current)
    }
    // Subscribe once: the handlers only use state setters and refs, which never go stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // While the bubble is open Esc closes it. The overlay is never focused, so main sends a dismiss
  // when it catches Escape (or a second launch with --dismiss); the keydown is for a plain browser.
  useEffect(() => {
    if (view !== 'triage') return
    api.setBubbleOpen(true)
    const close = (): void => {
      request.current++ // a late answer must not reopen what was closed
      setView('docked')
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

  // The window is fitted to the bubble, keeping its top-left; docked, it shrinks back around Pip;
  // the check-in gets its own size back only if Pip resized the window (else a first launch or a
  // snooze re-open would move it, or undo a size the person dragged).
  useEffect(() => {
    const el = frame.current
    if (view === 'checkIn' && resized.current) {
      resized.current = false
      api.setOverlayBounds({ x: screenX, y: screenY, ...CHECKIN_SIZE })
    }
    if (view === 'docked' && atCursor) {
      resized.current = true
      api.setOverlayBounds({ x: screenX, y: screenY, width: 0, height: 0 })
    }
    if (view !== 'triage' || !el) return
    const fit = (): void => {
      resized.current = true
      api.setOverlayBounds({
        x: screenX,
        y: screenY,
        width: BUBBLE_WIDTH + 2 * PAD,
        height: Math.ceil(el.getBoundingClientRect().height) + 2 * PAD
      })
    }
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    return () => observer.disconnect()
  }, [view, atCursor])

  if (!view) return <></>

  const answer = (n: number): void => {
    const at = new Date()
    api.saveCheckIn({ at: at.toISOString(), slot: slotFor(at), spoons: n })
    checkedIn.current = true
    afterCheckIn()
  }
  // Asks once more later, then leaves it: Pip never insists.
  const snoozeCheckIn = (): void => {
    setView('docked')
    if (snooze.current) return
    snooze.current = setTimeout(() => setView((v) => (v === 'docked' ? 'checkIn' : v)), SNOOZE_MS)
  }

  const corner = view === 'checkIn' || (view === 'docked' && !atCursor)

  return (
    <div
      data-overlay-root
      className={cn('flex h-screen p-[32px]', corner ? 'items-end justify-end' : 'items-start')}
    >
      {/* Drag any card or Pip to move the overlay, or the check-in's edge to resize it. */}
      <div
        {...drag}
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
        {view === 'triage' && <TriageBubble triage={triage} error={error} />}
        {view === 'docked' && (
          <DockedPip
            mood="calm"
            progress={null}
            doneStep={null}
            onOpen={() => {
              if (triage || error) setView('triage')
              else if (!checkedIn.current) setView('checkIn')
            }}
          />
        )}
      </div>
    </div>
  )
}

export default Overlay

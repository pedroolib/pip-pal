// The overlay: check-in → decode card → (calming) → task card, one step at a time → Pip docked.
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LOW_SPOONS, type CalmingStrategy, type CheckIn, type Decoded } from '@shared/schemas'
import { api } from '@renderer/api'
import { CalmingCard } from '@renderer/calm/CalmingCard'
import { CheckInCard } from '@renderer/checkin/CheckInCard'
import { SNOOZE_MS, slotFor } from '@renderer/checkin/model'
import { DecodeCard } from '@renderer/decode/DecodeCard'
import { planSteps } from '@renderer/decode/model'
import { ResizeEdges } from '@renderer/overlay/ResizeEdges'
import { useFitFont } from '@renderer/overlay/useFitFont'
import { useWindowDrag } from '@renderer/overlay/useWindowDrag'
import { cn } from '@renderer/lib/utils'
import { DockedPip } from '@renderer/pip/DockedPip'
import { TaskCard } from '@renderer/task/TaskCard'

// `?spoons=2` in the URL previews the low-energy plan in a plain browser.
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

type View = 'checkIn' | 'decode' | 'calm' | 'task' | 'docked'

function Overlay(): React.JSX.Element {
  const { t } = useTranslation()
  const drag = useWindowDrag()
  const [view, setView] = useState<View | null>(null)
  const [spoons, setSpoons] = useState<number | null>(null)
  const [decoded, setDecoded] = useState<Decoded | null>(null)
  const [strategy, setStrategy] = useState<CalmingStrategy | null>(null)
  const [calmThen, setCalmThen] = useState<'step1' | 'thisStep'>('step1')
  const [calmOffered, setCalmOffered] = useState(false)
  const [started, setStarted] = useState(false)
  const [current, setCurrent] = useState(0)
  const spoonsRef = useRef<number | null>(null)
  const snooze = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The open card fills the window and its text is sized to fit it (docked Pip keeps the default).
  const frame = useRef<HTMLDivElement>(null)
  useFitFont(
    frame,
    view !== null && view !== 'docked',
    `${view}:${current}:${decoded?.decode.summary}`
  )

  const showDecoded = (next: Decoded): void => {
    setDecoded(next)
    setStarted(false)
    setCurrent(0)
    setCalmOffered(false)
    setView('decode')
  }
  const decode = (text: string): void => {
    api.decode(text, spoonsRef.current).then(showDecoded)
  }

  useEffect(() => {
    Promise.all([api.listCheckIns(), api.getProfile()]).then(([checkIns, profile]) => {
      const s = spoonsOverride() ?? todaysSpoons(checkIns)
      spoonsRef.current = s
      setSpoons(s)
      setStrategy(profile.calmingStrategies[0] ?? null)
      if (s === null) setView('checkIn')
      // shortcut: decode the demo message on launch until the hotkey capture lands (module A)
      else api.decode('', s).then(showDecoded)
    })
    const offCaptured = api.onCaptured(decode)
    const offDue = api.onCheckInDue(() => setView('checkIn'))
    return () => {
      offCaptured()
      offDue()
      if (snooze.current) clearTimeout(snooze.current)
    }
    // Subscribe once: the handlers only use state setters and refs, which never go stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!view) return <></>

  const answer = (n: number): void => {
    const at = new Date()
    api.saveCheckIn({ at: at.toISOString(), slot: slotFor(at), spoons: n })
    spoonsRef.current = n
    setSpoons(n)
    if (decoded) setView('decode')
    // shortcut: stand-in for the hotkey capture, so the demo flows check-in → message
    else decode('')
  }
  // Asks once more later, then leaves it: Pip never insists.
  const snoozeCheckIn = (): void => {
    setView('docked')
    if (snooze.current) return
    snooze.current = setTimeout(() => setView((v) => (v === 'docked' ? 'checkIn' : v)), SNOOZE_MS)
  }

  const plan = decoded ? planSteps(decoded.decode.steps, spoons) : { now: [], later: [] }
  const finished = current >= plan.now.length
  const low = spoons !== null && spoons <= LOW_SPOONS

  const start = (): void => {
    setStarted(true)
    if (strategy && !calmOffered && (low || decoded?.decode.change)) {
      setCalmOffered(true)
      setCalmThen('step1')
      setView('calm')
    } else setView('task')
  }
  const stuck = (): void => {
    if (!strategy) return setView('decode')
    setCalmThen('thisStep')
    setView('calm')
  }
  const done = (): void => {
    api.addAchievement({
      at: new Date().toISOString(),
      kind: 'step_done',
      label: plan.now[current].text
    })
    setCurrent(current + 1)
  }

  return (
    <div data-overlay-root className="flex h-screen items-end justify-end p-[32px]">
      {/* Drag any card or Pip to move the overlay, or a card's edge to resize it; tall cards scroll. */}
      <div
        {...drag}
        ref={frame}
        className={cn(
          'relative flex max-h-full w-full flex-col items-end select-none',
          // Narrow window: button labels wrap and the button grows taller, instead of spilling out.
          '[&_[data-slot=button]]:h-auto [&_[data-slot=button]]:min-h-10 [&_[data-slot=button]]:min-w-0 [&_[data-slot=button]]:py-2 [&_[data-slot=button]]:text-center [&_[data-slot=button]]:whitespace-normal',
          view !== 'docked' &&
            'h-full [&>[data-slot=card]]:flex-1 [&>[data-slot=card]]:justify-between'
        )}
      >
        {view !== 'docked' && <ResizeEdges />}
        {view === 'checkIn' && <CheckInCard onAnswer={answer} onSnooze={snoozeCheckIn} />}
        {view === 'decode' && decoded && (
          <DecodeCard
            decoded={decoded}
            spoons={spoons}
            onStart={start}
            onLater={() => setView('docked')}
          />
        )}
        {view === 'calm' && strategy && (
          <CalmingCard
            strategy={strategy}
            then={t(`calm.${calmThen}`)}
            onDone={() => setView('task')}
          />
        )}
        {view === 'task' && decoded && (
          <TaskCard
            title={decoded.decode.asks[0] ?? decoded.decode.summary}
            steps={plan.now}
            laterCount={plan.later.length}
            current={current}
            due={decoded.decode.deadline?.text ?? null}
            onDone={done}
            onStuck={stuck}
            onMinimize={() => setView('docked')}
          />
        )}
        {view === 'docked' && (
          <DockedPip
            mood={started && finished ? 'happy' : 'calm'}
            progress={started ? current / plan.now.length : null}
            doneStep={current > 0 ? current : null}
            onOpen={() => setView(!decoded ? 'checkIn' : started && !finished ? 'task' : 'decode')}
          />
        )}
      </div>
    </div>
  )
}

export default Overlay

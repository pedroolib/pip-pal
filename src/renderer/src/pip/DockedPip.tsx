// Pip docked in the corner: a progress ring for the current task and a short "Step 2 done" pill.
// With cards open, one docked Pip per card, each with its action's icon as a badge.
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ActionKind } from '@shared/schemas'
import { cn } from '@renderer/lib/utils'
import { ACTION_ICON } from '@renderer/triage/icons'
import { PIP_SIZE } from '@renderer/triage/model'
import { Pip, type Mood } from './Pip'

// Pip is drawn at the bubble's size with no backdrop, so opening the bubble doesn't resize it;
// the progress ring sits around Pip, outside the button.
const RING = { size: 64, stroke: 3 }

export function DockedPip({
  mood,
  progress,
  doneStep,
  kind,
  label,
  active = false,
  onOpen
}: {
  mood: Mood
  /** 0–1, or null with no task in progress (no ring). */
  progress: number | null
  /** Number of the step just finished; shows the pill for a few seconds. */
  doneStep: number | null
  /** The card this Pip reopens, shown as a badge; none for the plain docked Pip. */
  kind?: ActionKind
  /** Accessible name; defaults to "Open Pip". */
  label?: string
  /** The card that was open last. */
  active?: boolean
  onOpen: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const Badge = kind && ACTION_ICON[kind]
  // Mounted fresh each time Pip docks, so the pill shows once and fades after a few seconds.
  const [pill, setPill] = useState(doneStep !== null)
  useEffect(() => {
    const id = setTimeout(() => setPill(false), 4000)
    return () => clearTimeout(id)
  }, [])

  const r = (RING.size - RING.stroke) / 2
  const length = 2 * Math.PI * r

  return (
    <div className="flex items-center gap-3">
      {pill && doneStep !== null && (
        <p
          data-overlay-hit
          role="status"
          className="pill-life flex items-center gap-2 rounded-full border bg-card py-1.5 pr-4 pl-2 text-sm font-bold shadow-md"
        >
          <Pip mood="happy" size={22} />
          {t('dock.stepDone', { n: doneStep })}
        </p>
      )}
      <button
        type="button"
        data-overlay-hit
        onClick={onOpen}
        aria-label={label ?? t('dock.open')}
        aria-current={active || undefined}
        className={cn(
          'pip-docked relative flex items-center justify-center rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
          active && 'ring-2 ring-primary/40 ring-offset-2 ring-offset-transparent'
        )}
      >
        {progress !== null && (
          <svg
            className="absolute -rotate-90"
            style={{ inset: (PIP_SIZE - RING.size) / 2 }}
            viewBox={`0 0 ${RING.size} ${RING.size}`}
            aria-hidden
          >
            <circle
              cx={RING.size / 2}
              cy={RING.size / 2}
              r={r}
              fill="none"
              stroke="var(--border)"
              strokeWidth={RING.stroke}
            />
            <circle
              cx={RING.size / 2}
              cy={RING.size / 2}
              r={r}
              fill="none"
              stroke="var(--primary)"
              strokeWidth={RING.stroke}
              strokeLinecap="round"
              strokeDasharray={length}
              strokeDashoffset={length * (1 - progress)}
              className="transition-[stroke-dashoffset] duration-500"
            />
          </svg>
        )}
        <Pip mood={mood} size={PIP_SIZE} />
        {Badge && (
          <span
            className="absolute -right-1 -bottom-1 flex size-6 items-center justify-center rounded-full border bg-card text-primary shadow-sm"
            aria-hidden
          >
            <Badge className="size-3.5" />
          </span>
        )}
      </button>
    </div>
  )
}

// Pip docked in the corner: a progress ring for the current task and a short "Step 2 done" pill.
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PIP_SIZE } from '@renderer/triage/model'
import { Pip, type Mood } from './Pip'

// Pip is drawn at the bubble's size with no backdrop, so opening the bubble doesn't resize it;
// the progress ring sits around Pip, outside the button.
const RING = { size: 64, stroke: 3 }

export function DockedPip({
  mood,
  progress,
  doneStep,
  onOpen
}: {
  mood: Mood
  /** 0–1, or null with no task in progress (no ring). */
  progress: number | null
  /** Number of the step just finished; shows the pill for a few seconds. */
  doneStep: number | null
  onOpen: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
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
          className="flex items-center gap-2 rounded-full border bg-card py-1.5 pr-4 pl-2 text-sm font-bold shadow-md"
        >
          <Pip mood="happy" size={22} />
          {t('dock.stepDone', { n: doneStep })}
        </p>
      )}
      <button
        type="button"
        data-overlay-hit
        onClick={onOpen}
        aria-label={t('dock.open')}
        className="relative flex items-center justify-center rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
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
      </button>
    </div>
  )
}

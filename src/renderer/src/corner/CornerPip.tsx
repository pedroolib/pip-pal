// The corner window (#/corner): Pip alone on the screen's right edge. Holding the bubble's buttons or
// the task card while the other is at the cursor, a click swaps the two; resting, a click opens the menu.
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CornerPip as Holding } from '@shared/ipc'
import { api } from '@renderer/api'
import { DockedPip } from '@renderer/pip/DockedPip'
import { usePaused } from '@renderer/pause'

/** The corner Pip itself; the plain browser draws it inside the overlay page. */
export function CornerButton({
  holding,
  onOpen
}: {
  holding: Holding
  onOpen: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [paused] = usePaused()
  return (
    <DockedPip
      mood={paused ? 'quiet' : 'calm'}
      progress={holding.progress}
      doneStep={null}
      label={t(holding.holds === 'menu' ? 'dock.openMenu' : 'dock.openTask')}
      onOpen={onOpen}
    />
  )
}

/** Pip resting on the screen edge with nothing to hold: a click opens the menu beside him. */
function RestingPip({ onOpen }: { onOpen: () => void }): React.JSX.Element {
  const { t } = useTranslation()
  const [paused] = usePaused()
  return (
    <DockedPip
      mood={paused ? 'quiet' : 'calm'}
      progress={null}
      doneStep={null}
      label={t('dock.open')}
      onOpen={onOpen}
    />
  )
}

export function CornerPip(): React.JSX.Element {
  const [holding, setHolding] = useState<Holding | null>(null)
  useEffect(() => api.onCorner(setHolding), [])
  // Main shows this window only when Pip holds something or may rest; either way, draw him.
  return (
    <div className="flex h-screen items-center justify-center">
      {holding ? (
        <CornerButton holding={holding} onOpen={() => api.clickCorner()} />
      ) : (
        <RestingPip onOpen={() => api.clickCorner()} />
      )}
    </div>
  )
}

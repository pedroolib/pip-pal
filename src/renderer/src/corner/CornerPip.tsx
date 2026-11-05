// The corner window (#/corner): Pip alone, holding the bubble's buttons or the task card while the
// other is at the cursor. A click tells the overlay to swap the two.
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

export function CornerPip(): React.JSX.Element {
  const [holding, setHolding] = useState<Holding | null>(null)
  useEffect(() => api.onCorner(setHolding), [])
  return (
    <div className="flex h-screen items-center justify-center">
      {holding && <CornerButton holding={holding} onOpen={() => api.clickCorner()} />}
    </div>
  )
}

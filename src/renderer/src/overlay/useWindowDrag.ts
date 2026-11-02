// Press anywhere on a card or on Pip and drag to move the overlay around the screen. A few pixels of
// slack keep normal clicks working; a drag that moved swallows the click that would follow it.
import { useRef } from 'react'
import { api } from '@renderer/api'

const SLACK = 4

const stop = (e: Event): void => e.stopPropagation()

export function useWindowDrag(): {
  onPointerDown: React.PointerEventHandler
  onPointerMove: React.PointerEventHandler
  onPointerUp: React.PointerEventHandler
  onPointerCancel: React.PointerEventHandler
} {
  const drag = useRef<{ x: number; y: number; winX: number; winY: number; moving: boolean } | null>(
    null
  )
  const frame = useRef(0)

  const end = (): void => {
    const d = drag.current
    drag.current = null
    if (!d?.moving) return
    // The drag ended on whatever is under the pointer; don't let it count as a click on it.
    window.addEventListener('click', stop, { capture: true, once: true })
    setTimeout(() => window.removeEventListener('click', stop, true), 0)
  }

  return {
    onPointerDown: (e) => {
      if (e.button !== 0) return
      drag.current = { x: e.screenX, y: e.screenY, winX: screenX, winY: screenY, moving: false }
    },
    onPointerMove: (e) => {
      const d = drag.current
      if (!d) return
      const dx = e.screenX - d.x
      const dy = e.screenY - d.y
      if (!d.moving) {
        if (Math.hypot(dx, dy) < SLACK) return
        d.moving = true
        // Only now, so a plain click still lands on the button it started on.
        e.currentTarget.setPointerCapture(e.pointerId)
      }
      cancelAnimationFrame(frame.current)
      frame.current = requestAnimationFrame(() =>
        api.setOverlayBounds({
          x: d.winX + dx,
          y: d.winY + dy,
          width: innerWidth,
          height: innerHeight
        })
      )
    },
    onPointerUp: end,
    onPointerCancel: end
  }
}

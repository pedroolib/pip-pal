// Invisible strips on a card's edges and corners that resize the overlay like a normal window:
// the cursor changes at the edge, and dragging moves that side. No visible handle.
import { useRef } from 'react'
import { OVERLAY_MIN } from '@shared/ipc'
import { api } from '@renderer/api'
import { cn } from '@renderer/lib/utils'

type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

// Each strip straddles the card's border so it's easy to hit without covering content.
const ZONES: Record<Edge, string> = {
  n: '-top-1 inset-x-3 h-2 cursor-ns-resize',
  s: '-bottom-1 inset-x-3 h-2 cursor-ns-resize',
  w: '-left-1 inset-y-3 w-2 cursor-ew-resize',
  e: '-right-1 inset-y-3 w-2 cursor-ew-resize',
  nw: '-top-1 -left-1 size-4 cursor-nwse-resize',
  se: '-bottom-1 -right-1 size-4 cursor-nwse-resize',
  ne: '-top-1 -right-1 size-4 cursor-nesw-resize',
  sw: '-bottom-1 -left-1 size-4 cursor-nesw-resize'
}

export function ResizeEdges(): React.JSX.Element {
  const start = useRef<{ edge: Edge; x: number; y: number; b: DOMRect } | null>(null)
  const frame = useRef(0)

  const move = (e: React.PointerEvent): void => {
    const s = start.current
    if (!s) return
    const dx = e.screenX - s.x
    const dy = e.screenY - s.y
    let { x, y, width, height } = s.b
    // Clamp here too, so a side that hits the minimum stops instead of pushing the window along.
    if (s.edge.includes('e')) width = Math.max(OVERLAY_MIN.width, width + dx)
    if (s.edge.includes('s')) height = Math.max(OVERLAY_MIN.height, height + dy)
    if (s.edge.includes('w')) {
      const w = Math.max(OVERLAY_MIN.width, width - dx)
      x += width - w
      width = w
    }
    if (s.edge.includes('n')) {
      const h = Math.max(OVERLAY_MIN.height, height - dy)
      y += height - h
      height = h
    }
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => api.setOverlayBounds({ x, y, width, height }))
  }

  return (
    <>
      {(Object.keys(ZONES) as Edge[]).map((edge) => (
        <div
          key={edge}
          data-overlay-hit
          aria-hidden
          className={cn('absolute z-10 touch-none', ZONES[edge])}
          onPointerDown={(e) => {
            if (e.button !== 0) return
            // Resizing, not moving: keep the card's drag-to-move from seeing this press.
            e.stopPropagation()
            e.currentTarget.setPointerCapture(e.pointerId)
            start.current = {
              edge,
              x: e.screenX,
              y: e.screenY,
              b: new DOMRect(screenX, screenY, innerWidth, innerHeight)
            }
          }}
          onPointerMove={move}
          onPointerUp={() => (start.current = null)}
          onPointerCancel={() => (start.current = null)}
        />
      ))}
    </>
  )
}

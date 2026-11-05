import { useEffect, useRef, useState } from 'react'
import { motionAllowed } from '@renderer/theme'

/**
 * Counts from the last shown value up (or down) to `target` with an ease-out, so a number settles
 * instead of jumping. Instant when motion is off. Show the result with aria-hidden and give screen
 * readers the final number separately: the in-between values are only for the eyes.
 */
export function useCountUp(target: number, duration = 700): number {
  const animate = motionAllowed()
  const [shown, setShown] = useState(0)
  const from = useRef(0)
  useEffect(() => {
    if (!animate) return
    const start = performance.now()
    const begin = from.current
    let frame = 0
    const tick = (now: number): void => {
      const p = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      const value = Math.round(begin + (target - begin) * eased)
      from.current = value
      setShown(value)
      if (p < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, duration, animate])
  return animate ? shown : target
}

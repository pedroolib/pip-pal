import { useCallback, useEffect, useState } from 'react'

/**
 * Local reads (check-ins, achievements): load once, retry on demand. With `onFocus`, also reload
 * when the window gains focus, since the overlay (another window) can add to them.
 */
export function useLoad<T>(
  fn: () => Promise<T>,
  { onFocus = false }: { onFocus?: boolean } = {}
): {
  data: T | null
  failed: boolean
  reload: () => void
} {
  const [data, setData] = useState<T | null>(null)
  const [failed, setFailed] = useState(false)
  const [n, setN] = useState(0)
  useEffect(() => {
    let alive = true
    fn()
      .then((d) => alive && (setData(d), setFailed(false)))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
    // `fn` is a stable api method per view; only a retry reruns the load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n])
  const reload = useCallback(() => setN((x) => x + 1), [])
  useEffect(() => {
    if (!onFocus) return
    window.addEventListener('focus', reload)
    return () => window.removeEventListener('focus', reload)
  }, [onFocus, reload])
  return { data, failed, reload }
}

// A small per-computer preference kept in browser storage. The overlay and Pip's House share one
// origin, so a change in one window reaches the other through the `storage` event. Used for
// choices that only shape this computer's screen (theme, pause, reading comfort), so they never
// need the settings file that main, preload and renderer share.
import { useSyncExternalStore } from 'react'

export type LocalPref<T> = {
  get: () => T
  set: (value: T) => void
  /** Calls `fn` on every change, from this window or the other one. Returns the unsubscribe. */
  subscribe: (fn: () => void) => () => void
  use: () => [T, (value: T) => void]
}

export function localPref<T>(
  key: string,
  fallback: T,
  parse: (raw: unknown) => T | null
): LocalPref<T> {
  const event = `pref-change:${key}`
  // useSyncExternalStore needs the same object back while nothing changed.
  let cache: { raw: string | null; value: T } | null = null

  const get = (): T => {
    let raw: string | null = null
    try {
      raw = localStorage.getItem(key)
    } catch {
      // Storage blocked: the fallback stands.
    }
    if (cache && cache.raw === raw) return cache.value
    let value = fallback
    if (raw !== null) {
      try {
        value = parse(JSON.parse(raw)) ?? fallback
      } catch {
        value = fallback
      }
    }
    cache = { raw, value }
    return value
  }

  const set = (value: T): void => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Storage blocked: the choice lasts until the window closes.
      cache = { raw: '__memory__', value }
    }
    window.dispatchEvent(new Event(event))
  }

  const subscribe = (fn: () => void): (() => void) => {
    const onStorage = (e: StorageEvent): void => {
      if (e.key === key || e.key === null) fn()
    }
    window.addEventListener(event, fn)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(event, fn)
      window.removeEventListener('storage', onStorage)
    }
  }

  const use = (): [T, (value: T) => void] => [useSyncExternalStore(subscribe, get), set]

  return { get, set, subscribe, use }
}

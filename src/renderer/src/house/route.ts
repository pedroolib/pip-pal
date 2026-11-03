export const TABS = [
  'home',
  'profile',
  'achievements',
  'summary',
  'connections',
  'settings'
] as const
export type Tab = (typeof TABS)[number]

/** `#/home` is Home, `#/home/<tab>` is that tab; anything unknown is Home. */
export function tabFromHash(hash: string): Tab {
  const m = /^#\/home\/([^/]+)$/.exec(hash)
  return TABS.find((t) => t === m?.[1]) ?? 'home'
}

export const hashFor = (tab: Tab): string => (tab === 'home' ? '#/home' : `#/home/${tab}`)

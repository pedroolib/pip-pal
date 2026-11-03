import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@renderer/api'
import Manual from '@renderer/manual/Manual'
import { AchievementsView } from './AchievementsView'
import { ConnectionsView } from './ConnectionsView'
import { HomeView } from './HomeView'
import { hashFor, tabFromHash, type Tab } from './route'
import { SettingsView } from './SettingsView'
import { applySettings } from './settings'
import { SummaryView } from './SummaryView'
import { TabBar } from './TabBar'

/** Pip's House: the current tab (kept in the URL hash, so a reload stays put) above a sticky tab bar. */
export function House(): React.JSX.Element {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>(() => tabFromHash(location.hash))
  useEffect(() => {
    const sync = (): void => {
      const next = tabFromHash(location.hash)
      // An unknown `#/home/<x>` is Home: make the address say so.
      if (location.hash !== hashFor(next) && location.hash.startsWith('#/home/'))
        history.replaceState(null, '', hashFor(next))
      setTab(next)
    }
    sync()
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])
  useEffect(() => {
    api.getSettings().then(applySettings, () => {})
    // Hides the page scroll bar (main.css), so the tab bar never shifts between tabs.
    document.documentElement.classList.add('house-page')
    return () => document.documentElement.classList.remove('house-page')
  }, [])
  useEffect(() => {
    document.title = `${t(`house.tabs.${tab}`)} - ${t('house.nav')}`
    window.scrollTo(0, 0)
  }, [tab, t])

  const home = tab === 'home'
  return (
    // Home is the room: it fills the window and only the floor under Pip scrolls.
    <div className={home ? 'flex h-dvh flex-col bg-room-floor' : 'flex min-h-dvh flex-col'}>
      <a
        href="#main"
        onClick={(e) => {
          // Not a hash jump (that is the route): focus the view's own <main>.
          e.preventDefault()
          const main = document.querySelector('main')
          main?.setAttribute('tabindex', '-1')
          main?.focus()
        }}
        className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:top-2 focus-visible:left-2 focus-visible:z-20 focus-visible:rounded-full focus-visible:bg-surface focus-visible:px-5 focus-visible:py-3 focus-visible:font-bold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring"
      >
        {t('house.skip')}
      </a>
      {/* Each view brings its own <main> landmark (Manual does too). */}
      <div className="flex min-h-0 flex-1 flex-col">
        {tab === 'home' && <HomeView />}
        {tab === 'profile' && <Manual />}
        {tab === 'achievements' && <AchievementsView />}
        {tab === 'summary' && <SummaryView />}
        {tab === 'connections' && <ConnectionsView />}
        {tab === 'settings' && <SettingsView />}
      </div>
      <TabBar current={tab} />
    </div>
  )
}

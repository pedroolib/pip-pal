import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@renderer/api'
import Manual from '@renderer/manual/Manual'
import { AchievementsView } from './AchievementsView'
import { ConnectionsView } from './ConnectionsView'
import { HomeView } from './HomeView'
import { tabFromHash, type Tab } from './route'
import { SettingsView } from './SettingsView'
import { applySettings } from './settings'
import { SummaryView } from './SummaryView'
import { TabBar } from './TabBar'

/** Pip's House: the current tab (kept in the URL hash, so a reload stays put) above a sticky tab bar. */
export function House(): React.JSX.Element {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>(() => tabFromHash(location.hash))
  useEffect(() => {
    const sync = (): void => setTab(tabFromHash(location.hash))
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])
  useEffect(() => {
    api.getSettings().then(applySettings, () => {})
  }, [])
  useEffect(() => {
    document.title = `${t(`house.tabs.${tab}`)} - ${t('house.nav')}`
    window.scrollTo(0, 0)
  }, [tab, t])

  const home = tab === 'home'
  return (
    // Home is the room: it fills the window and only the floor under Pip scrolls.
    <div className={home ? 'flex h-dvh flex-col bg-room-floor' : 'flex min-h-dvh flex-col'}>
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

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Settings } from '@shared/schemas'
import { api } from '@renderer/api'
import Manual from '@renderer/manual/Manual'
import { Onboarding } from '@renderer/onboarding/Onboarding'
import { FRESH } from '@renderer/onboarding/model'
import { AchievementsView } from './AchievementsView'
import { ConnectionsView } from './ConnectionsView'
import { HomeView } from './HomeView'
import { RoomView } from './RoomView'
import { hashFor, ROOM_HASH, tabFromHash, type Tab } from './route'
import { SettingsView } from './SettingsView'
import { applySettings } from './settings'
import { SummaryView } from './SummaryView'
import { TabBar } from './TabBar'

/** Pip's House: the current tab (kept in the URL hash, so a reload stays put) above a sticky tab bar. */
export function House(): React.JSX.Element {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>(() => tabFromHash(location.hash))
  const [inRoom, setInRoom] = useState(() => location.hash === ROOM_HASH)
  useEffect(() => {
    const sync = (): void => {
      setInRoom(location.hash === ROOM_HASH)
      const next = tabFromHash(location.hash)
      // An unknown `#/home/<x>` is Home: make the address say so.
      if (
        location.hash !== hashFor(next) &&
        location.hash.startsWith('#/home/') &&
        location.hash !== ROOM_HASH
      )
        history.replaceState(null, '', hashFor(next))
      setTab(next)
    }
    sync()
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])
  // Detection runs once when the House opens; null until it answers (or if it fails).
  const [learned, setLearned] = useState<number | null>(null)
  useEffect(() => {
    api.refreshLearned().then(
      (p) => setLearned(p.pending?.length ?? 0),
      () => {}
    )
  }, [])
  // Onboarding shows until it is done; a failed read opens the House (it never traps the person).
  const [setup, setSetup] = useState<Settings | null>(null)
  useEffect(() => {
    api.getSettings().then(
      (s) => {
        applySettings(s)
        if (!s.onboarding?.done) setSetup(s)
      },
      () => {}
    )
    // Hides the page scroll bar (main.css), so the tab bar never shifts between tabs.
    document.documentElement.classList.add('house-page')
    return () => document.documentElement.classList.remove('house-page')
  }, [])
  useEffect(() => {
    document.title = `${t(`house.tabs.${tab}`)} - ${t('house.nav')}`
    window.scrollTo(0, 0)
  }, [tab, t])

  if (setup)
    return (
      <div className="flex min-h-dvh flex-col bg-background">
        <Onboarding
          settings={setup}
          start={setup.onboarding ?? FRESH}
          onDone={() => {
            setSetup(null)
            location.hash = '#/home'
            // Learned during setup: the House badge counts what is still waiting.
            api.getProfile().then(
              (p) => setLearned(p.pending?.length ?? 0),
              () => {}
            )
          }}
        />
      </div>
    )

  return (
    // A sidebar beside the page from 768px; below that the page sits above a slim tab bar.
    <div className="flex min-h-dvh flex-col md:flex-row">
      <a
        href="#main"
        onClick={(e) => {
          // Not a hash jump (that is the route): focus the view's own <main>.
          e.preventDefault()
          const main = document.querySelector('main')
          main?.setAttribute('tabindex', '-1')
          main?.focus()
        }}
        className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:top-2 focus-visible:left-2 focus-visible:z-20 focus-visible:rounded-lg focus-visible:bg-surface focus-visible:px-4 focus-visible:py-3 focus-visible:font-bold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring"
      >
        {t('house.skip')}
      </a>
      {/* Each view brings its own <main> landmark (Manual does too). */}
      <TabBar current={inRoom ? null : tab} learned={learned ?? 0} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {inRoom && <RoomView />}
        {!inRoom && tab === 'home' && <HomeView learned={learned ?? 0} />}
        {!inRoom && tab === 'profile' && <Manual onPendingChange={setLearned} />}
        {!inRoom && tab === 'achievements' && <AchievementsView />}
        {!inRoom && tab === 'summary' && <SummaryView />}
        {!inRoom && tab === 'connections' && <ConnectionsView />}
        {!inRoom && tab === 'settings' && (
          <SettingsView onRunSetup={(s) => setSetup({ ...s, onboarding: FRESH })} />
        )}
      </div>
    </div>
  )
}

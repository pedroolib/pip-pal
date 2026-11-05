import { useTranslation } from 'react-i18next'
import { FileText, House as HouseIcon, Plug, Settings, Trophy, UserRound } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { Pip } from '@renderer/pip/Pip'
import { Keys } from './parts'
import { PauseControl } from './PauseControl'
import { hashFor, TABS, type Tab } from './route'
import { ThemePicker } from './ThemePicker'

const ICONS = {
  home: HouseIcon,
  profile: UserRound,
  achievements: Trophy,
  summary: FileText,
  connections: Plug,
  settings: Settings
} satisfies Record<Tab, unknown>

const focus =
  'outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring'

/** A quiet count beside a tab (Pip's suggestions waiting on My profile). */
function Count({ n, label }: { n: number; label: string }): React.JSX.Element {
  return (
    <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[0.6875rem] leading-none font-bold text-primary-foreground">
      <span aria-hidden>{n}</span>
      <span className="sr-only">{label}</span>
    </span>
  )
}

/**
 * The House's navigation. A sidebar from 768px, like a desktop app; below that, a slim bar at the
 * bottom with short labels. `learned` puts a count on My profile.
 */
export function TabBar({
  current,
  learned = 0
}: {
  current: Tab
  learned?: number
}): React.JSX.Element {
  const { t } = useTranslation()
  const countLabel = t('house.home.learned', { count: learned })
  return (
    <>
      <nav
        aria-label={t('house.nav')}
        className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r bg-sidebar px-3 pt-5 pb-4 md:flex"
      >
        <div className="mb-6 flex items-center gap-2.5 px-2.5">
          <Pip mood="calm" size={30} decorative />
          <span className="text-[0.9375rem] font-bold">{t('house.nav')}</span>
        </div>
        <ul className="relative flex flex-col gap-0.5">
          {/* One highlight slides to the current tab (rows are 2.5rem plus a 0.125rem gap). */}
          <li
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-10 rounded-lg bg-surface shadow-active transition-transform duration-300 ease-(--ease-out)"
            style={{ transform: `translateY(calc(${TABS.indexOf(current)} * 2.625rem))` }}
          />
          {TABS.map((tab) => {
            const Icon = ICONS[tab]
            const active = tab === current
            return (
              <li key={tab} className="relative">
                <a
                  href={hashFor(tab)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex h-10 items-center gap-3 rounded-lg px-2.5 text-[0.9375rem] transition-colors',
                    focus,
                    active
                      ? 'font-bold text-foreground'
                      : 'text-body hover:bg-foreground/[0.05] hover:text-foreground'
                  )}
                >
                  <Icon
                    className={cn(
                      'size-[18px] shrink-0 transition-colors duration-300',
                      active ? 'text-primary' : 'text-muted-foreground'
                    )}
                    aria-hidden
                  />
                  {t(`house.tabs.${tab}`)}
                  {tab === 'profile' && learned > 0 && <Count n={learned} label={countLabel} />}
                </a>
              </li>
            )
          })}
        </ul>
        <div className="mt-auto flex flex-col gap-3 px-1">
          <PauseControl compact />
          <div className="rounded-xl border bg-surface p-3.5 shadow-card">
            <p className="text-sm font-bold">{t('house.sidebar.shortcut')}</p>
            <p className="mt-0.5 mb-2.5 text-[0.8125rem] leading-snug text-muted-foreground">
              {t('house.sidebar.shortcutBody')}
            </p>
            <Keys small />
          </div>
          <ThemePicker compact />
        </div>
      </nav>

      <nav
        aria-label={t('house.nav')}
        className="sticky bottom-0 z-10 order-last border-t bg-surface/95 px-2 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] backdrop-blur md:hidden"
      >
        <ul className="mx-auto grid grid-cols-6 gap-1">
          {TABS.map((tab) => {
            const Icon = ICONS[tab]
            const active = tab === current
            return (
              <li key={tab} className="min-w-0">
                <a
                  href={hashFor(tab)}
                  aria-label={t(`house.tabs.${tab}`)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-lg text-center text-[0.75rem] leading-tight',
                    focus,
                    active
                      ? 'font-bold text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon className="size-5" aria-hidden />
                  <span aria-hidden className="max-w-full truncate">
                    {t(`house.tabsShort.${tab}`)}
                  </span>
                </a>
              </li>
            )
          })}
        </ul>
      </nav>
    </>
  )
}

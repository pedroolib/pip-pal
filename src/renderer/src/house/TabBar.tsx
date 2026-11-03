import { useTranslation } from 'react-i18next'
import { FileText, House as HouseIcon, Plug, Settings, Trophy, UserRound } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { hashFor, TABS, type Tab } from './route'

const ICONS = {
  home: HouseIcon,
  profile: UserRound,
  achievements: Trophy,
  summary: FileText,
  connections: Plug,
  settings: Settings
} satisfies Record<Tab, unknown>

/** Chunky bottom bar. Short labels under 640px, full from there, icon beside label from 900px. */
export function TabBar({ current }: { current: Tab }): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <nav
      aria-label={t('house.nav')}
      className="sticky bottom-0 z-10 border-t bg-surface px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-[0_-8px_24px_-16px_rgb(30_42_54/0.25)]"
    >
      <ul className="mx-auto grid max-w-[880px] grid-cols-6 gap-1">
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
                  'flex min-h-[60px] flex-col items-center justify-center gap-0.5 rounded-[22px] text-center text-xs leading-tight font-bold outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring sm:text-[0.8125rem] min-[900px]:min-h-[52px] min-[900px]:flex-row min-[900px]:gap-2 min-[900px]:text-[0.9375rem]',
                  active
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="size-[26px] min-[900px]:size-[22px]" aria-hidden />
                <span aria-hidden className="sm:hidden">
                  {t(`house.tabsShort.${tab}`)}
                </span>
                <span aria-hidden className="hidden sm:inline">
                  {t(`house.tabs.${tab}`)}
                </span>
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

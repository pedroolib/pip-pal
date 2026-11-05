// Home's two summary panels: energy (today plus recent days) and wins (totals plus the latest).
import { useTranslation } from 'react-i18next'
import { ArrowRight, CheckCheck, Compass, MessageCircleQuestion } from 'lucide-react'
import type { Achievement, CheckIn } from '@shared/schemas'
import { Face } from '@renderer/checkin/Face'
import { cn } from '@renderer/lib/utils'
import { useCountUp } from '@renderer/lib/useCountUp'
import { AchievementRow } from './AchievementRow'
import { groupByDay, isToday, latest, timeLabel } from './days'
import { HouseCard } from './parts'
import { hashFor } from './route'

const KIND_ICONS = {
  step_done: CheckCheck,
  change_navigated: Compass,
  asked_not_guessed: MessageCircleQuestion
} satisfies Record<Achievement['kind'], unknown>
const KINDS = Object.keys(KIND_ICONS) as Achievement['kind'][]

/** How many days the energy bars show: the most recent days that have a check-in. */
const DAYS_SHOWN = 5

/** Small label over a panel. */
function PanelLabel({
  id,
  children
}: {
  id: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <h2 id={id} className="text-[0.8125rem] font-bold text-muted-foreground">
      {children}
    </h2>
  )
}

/** One bar per recent day, its height the day's average energy (1 to 5). */
function EnergyBars({ checkIns }: { checkIns: CheckIn[] }): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const days = groupByDay(checkIns)
    .slice(0, DAYS_SHOWN)
    .reverse()
    .map((g) => ({
      at: g.at,
      level: Math.round(g.items.reduce((sum, c) => sum + c.spoons, 0) / g.items.length)
    }))
  if (days.length === 0)
    return <p className="text-sm text-muted-foreground">{t('house.home.energyLatelyEmpty')}</p>
  const weekday = new Intl.DateTimeFormat(i18n.language, { weekday: 'short' })
  const long = new Intl.DateTimeFormat(i18n.language, { weekday: 'long', day: 'numeric' })
  return (
    <ul className="flex h-28 items-end gap-2.5">
      {days.map((d, i) => (
        <li
          key={d.at}
          aria-label={t('house.home.energyDay', {
            day: long.format(new Date(d.at)),
            count: d.level
          })}
          className="flex h-full flex-1 flex-col items-center gap-1.5"
        >
          <div aria-hidden className="flex w-full max-w-10 flex-1 items-end rounded-md bg-muted">
            <div
              style={{ height: `${(d.level / 5) * 100}%`, animationDelay: `${120 + i * 70}ms` }}
              className={cn(
                'motion-grow w-full rounded-md',
                isToday(d.at) ? 'bg-primary' : 'bg-primary/55'
              )}
            />
          </div>
          <span aria-hidden className="text-xs font-bold text-muted-foreground capitalize">
            {weekday.format(new Date(d.at))}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function EnergyCard({ checkIns }: { checkIns: CheckIn[] | null }): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const today = latest((checkIns ?? []).filter((c) => isToday(c.at)))
  return (
    <HouseCard aria-labelledby="home-energy" className="gap-4">
      <PanelLabel id="home-energy">{t('house.home.energy')}</PanelLabel>
      {today ? (
        <div className="flex items-center gap-3.5">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-pip-soft">
            <Face level={today.spoons} size={34} />
          </span>
          <div className="min-w-0">
            <p className="font-bold">{t('checkIn.spoons', { count: today.spoons })}</p>
            <p className="text-sm text-muted-foreground">
              {t(`house.home.slot.${today.slot}`, { time: timeLabel(today.at, i18n.language) })}
            </p>
          </div>
        </div>
      ) : (
        <div>
          <p className="font-bold">{t('house.home.noCheckIn')}</p>
          <p className="text-sm text-muted-foreground">{t('house.home.noCheckInHint')}</p>
        </div>
      )}
      <div className="mt-auto border-t pt-4">
        <p className="mb-3 text-[0.8125rem] font-bold text-muted-foreground">
          {t('house.home.energyLately')}
        </p>
        <EnergyBars checkIns={checkIns ?? []} />
      </div>
    </HouseCard>
  )
}

/** A total that counts up when it appears; screen readers get the final number only. */
function Count({ n }: { n: number }): React.JSX.Element {
  const shown = useCountUp(n)
  return (
    <span className="text-2xl leading-none font-bold tabular-nums">
      <span aria-hidden>{shown}</span>
      <span className="sr-only">{n}</span>
    </span>
  )
}

/** Totals by kind, each with its icon and its name in words. */
export function WinTotals({
  achievements,
  onPage = false,
  className
}: {
  achievements: Achievement[]
  /** Straight on the page (Achievements) instead of inside a card (Home): tiles get their own panel. */
  onPage?: boolean
  className?: string
}): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <ul className={cn('grid grid-cols-3 gap-2', className)}>
      {KINDS.map((kind) => {
        const Icon = KIND_ICONS[kind]
        const n = achievements.filter((a) => a.kind === kind).length
        return (
          <li
            key={kind}
            className={cn(
              'flex flex-col gap-2 rounded-xl p-3',
              onPage ? 'border bg-surface p-4 shadow-card' : 'bg-muted/70'
            )}
          >
            <span className="grid size-8 place-items-center rounded-lg bg-secondary text-primary">
              <Icon className="size-4" aria-hidden />
            </span>
            <Count n={n} />
            <span className="text-[0.8125rem] leading-tight text-muted-foreground">
              {t(`house.achievements.totals.${kind}`)}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

export function WinsCard({
  achievements
}: {
  achievements: Achievement[] | null
}): React.JSX.Element {
  const { t } = useTranslation()
  const win = latest(achievements ?? [])
  return (
    <HouseCard aria-labelledby="home-win" className="gap-4">
      <div className="flex items-center justify-between gap-3">
        <PanelLabel id="home-win">{t('house.home.wins')}</PanelLabel>
        <a
          href={hashFor('achievements')}
          className="-my-1 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-sm font-bold text-primary outline-none hover:bg-secondary focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring"
        >
          {t('house.home.seeAll')}
          <ArrowRight className="size-3.5" aria-hidden />
        </a>
      </div>
      <WinTotals achievements={achievements ?? []} />
      <div className="mt-auto border-t pt-4">
        <p className="mb-3 text-[0.8125rem] font-bold text-muted-foreground">
          {t('house.home.latestWin')}
        </p>
        {win ? (
          <AchievementRow a={win} when="dayAndTime" />
        ) : (
          <div>
            <p className="font-bold">{t('house.home.noAchievement')}</p>
            <p className="text-sm text-muted-foreground">{t('house.home.noAchievementHint')}</p>
          </div>
        )}
      </div>
    </HouseCard>
  )
}

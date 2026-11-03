import { useTranslation } from 'react-i18next'
import { api } from '@renderer/api'
import { Button } from '@renderer/components/ui/button'
import { Pip } from '@renderer/pip/Pip'
import { AchievementRow } from './AchievementRow'
import { dayLabel, groupByDay } from './days'
import { HouseCard, Page } from './parts'
import { useLoad } from './useLoad'

export function AchievementsView(): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const { data, failed, reload } = useLoad(api.listAchievements)
  const groups = groupByDay(data ?? [])

  return (
    <Page title={t('house.titles.achievements')} intro={t('house.achievements.intro')}>
      {failed ? (
        <HouseCard role="alert">
          <p className="font-bold">{t('house.achievements.errorTitle')}</p>
          <Button className="w-fit" onClick={reload}>
            {t('house.achievements.retry')}
          </Button>
        </HouseCard>
      ) : data === null ? (
        <div role="status" className="grid gap-3">
          <span className="sr-only">{t('house.achievements.loading')}</span>
          {[0, 1, 2].map((i) => (
            <div key={i} aria-hidden className="h-16 rounded-card bg-muted" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <HouseCard className="items-center px-5 py-7 text-center">
          <Pip mood="calm" size={80} />
          <p className="max-w-[38ch] text-body">{t('house.achievements.emptyBody')}</p>
        </HouseCard>
      ) : (
        groups.map((g) => (
          <section key={g.at} className="flex flex-col gap-2.5">
            <h2 className="px-1 font-bold text-body">{dayLabel(g.at, i18n.language)}</h2>
            <HouseCard className="gap-0 py-2">
              <ul>
                {g.items.map((a) => (
                  <li key={a.at + a.label} className="border-border py-3.5 not-first:border-t">
                    <AchievementRow a={a} when="time" />
                  </li>
                ))}
              </ul>
            </HouseCard>
          </section>
        ))
      )}
    </Page>
  )
}

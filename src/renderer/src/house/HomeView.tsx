import { useTranslation } from 'react-i18next'
import { api } from '@renderer/api'
import { AchievementRow } from './AchievementRow'
import { isToday, latest, timeLabel } from './days'
import { HouseCard } from './parts'
import { useLoad } from './useLoad'
import { Room } from './Room'

/** Five dots plus words: spoons are never shown by color or count alone. */
function Spoons({ count }: { count: number }): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div role="img" aria-label={t('house.home.spoonsOf', { count })} className="flex gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={`size-3.5 rounded-full border-2 border-primary ${n <= count ? 'bg-primary' : ''}`}
        />
      ))}
    </div>
  )
}

/** The room, with today's calm summary on the floor. Failed reads just show the empty text. */
export function HomeView(): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const checkIns = useLoad(() => api.listCheckIns(), { onFocus: true }).data
  const achievements = useLoad(() => api.listAchievements(), { onFocus: true }).data
  const today = latest((checkIns ?? []).filter((c) => isToday(c.at)))
  const win = latest(achievements ?? [])

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <Room />
      <div className="min-h-0 flex-1 overflow-y-auto bg-room-floor">
        <div className="mx-auto flex w-full max-w-[880px] flex-col gap-5 p-4 pt-1 pb-8">
          <h1 className="px-1 text-xl font-bold">{t('house.home.today')}</h1>
          <div className="grid gap-4 sm:grid-cols-2">
            <HouseCard aria-labelledby="home-energy">
              <h2 id="home-energy" className="text-[1.0625rem] leading-snug font-bold">
                {t('house.home.energy')}
              </h2>
              {today ? (
                <>
                  <Spoons count={today.spoons} />
                  <div>
                    <p className="font-bold">{t('checkIn.spoons', { count: today.spoons })}</p>
                    <p className="text-sm text-muted-foreground">
                      {t(`house.home.slot.${today.slot}`, {
                        time: timeLabel(today.at, i18n.language)
                      })}
                    </p>
                  </div>
                </>
              ) : (
                <div>
                  <p className="font-bold">{t('house.home.noCheckIn')}</p>
                  <p className="text-sm text-muted-foreground">{t('house.home.noCheckInHint')}</p>
                </div>
              )}
            </HouseCard>
            <HouseCard aria-labelledby="home-win">
              <h2 id="home-win" className="text-[1.0625rem] leading-snug font-bold">
                {t('house.home.latest')}
              </h2>
              {win ? (
                <AchievementRow a={win} when="dayAndTime" />
              ) : (
                <div>
                  <p className="font-bold">{t('house.home.noAchievement')}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('house.home.noAchievementHint')}
                  </p>
                </div>
              )}
            </HouseCard>
          </div>
        </div>
      </div>
    </main>
  )
}

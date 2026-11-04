import { useTranslation } from 'react-i18next'
import { api } from '@renderer/api'
import { Button } from '@renderer/components/ui/button'
import { Face } from '@renderer/checkin/Face'
import { hashFor } from './route'
import { AchievementRow } from './AchievementRow'
import { isToday, latest, timeLabel } from './days'
import { HouseCard } from './parts'
import { useLoad } from './useLoad'
import { Room } from './Room'

/** The room, with today's calm summary on the floor. Failed reads just show the empty text. */
export function HomeView({ learned }: { learned: number }): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const checkIns = useLoad(() => api.listCheckIns(), { onFocus: true }).data
  const achievements = useLoad(() => api.listAchievements(), { onFocus: true }).data
  const reminders = useLoad(() => api.listReminders(), { onFocus: true })
  const reload = reminders.reload
  const pending = (reminders.data ?? []).filter((r) => r.parked)
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
                  <Face level={today.spoons} size={48} />
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
          {pending.length > 0 && (
            <HouseCard aria-labelledby="home-pending">
              <h2 id="home-pending" className="text-[1.0625rem] leading-snug font-bold">
                {t('house.home.pending.title')}
              </h2>
              <p className="text-sm text-muted-foreground">{t('house.home.pending.hint')}</p>
              <ul className="flex flex-col gap-3">
                {pending.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-3">
                    <span className="min-w-0 flex-1 font-bold">{r.title}</span>
                    <Button
                      variant="outline"
                      onClick={() => api.showReminder(r.id).then(reload, reload)}
                    >
                      {t('house.home.pending.show')}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => api.finishReminder(r.id).then(reload, reload)}
                    >
                      {t('house.home.pending.done')}
                    </Button>
                  </li>
                ))}
              </ul>
            </HouseCard>
          )}
          {learned > 0 && (
            <HouseCard aria-labelledby="home-learned">
              <h2 id="home-learned" className="text-[1.0625rem] leading-snug font-bold">
                {t('house.home.learned', { count: learned })}
              </h2>
              <p className="text-sm text-muted-foreground">{t('house.home.learnedHint')}</p>
              <Button asChild className="min-h-11 w-fit rounded-full px-5 font-bold">
                <a href={hashFor('profile')}>{t('house.home.learnedAction')}</a>
              </Button>
            </HouseCard>
          )}
        </div>
      </div>
    </main>
  )
}

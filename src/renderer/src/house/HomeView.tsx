import { useTranslation } from 'react-i18next'
import { ArrowRight, Sparkles } from 'lucide-react'
import { api } from '@renderer/api'
import { Button } from '@renderer/components/ui/button'
import { hashFor } from './route'
import { usePaused } from '@renderer/pause'
import { ChangesCard } from './ChangesCard'
import { ComingUp } from './ComingUp'
import { PauseControl } from './PauseControl'
import { EnergyCard, WinsCard } from './HomeCards'
import { HouseCard } from './parts'
import { useLoad } from './useLoad'
import { Room } from './Room'

/** A greeting, energy and wins side by side, what is coming up. Failed reads show the empty text. */
export function HomeView({ learned }: { learned: number }): React.JSX.Element {
  const { t } = useTranslation()
  const [paused] = usePaused()
  const checkIns = useLoad(() => api.listCheckIns(), { onFocus: true }).data
  const achievements = useLoad(() => api.listAchievements(), { onFocus: true }).data

  return (
    <main className="mx-auto flex w-full max-w-[960px] min-w-0 flex-col gap-3 px-5 pt-8 pb-12 md:px-10 md:pt-10">
      <Room />
      {paused && <PauseControl />}

      {learned > 0 && (
        <HouseCard
          aria-labelledby="home-learned"
          className="motion-swap flex-row flex-wrap items-center gap-x-4 gap-y-3 border-primary/25 bg-secondary/60 py-4"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface text-primary">
            <Sparkles className="size-[18px]" aria-hidden />
          </span>
          <div className="min-w-0 flex-[1_1_16rem]">
            <h2 id="home-learned" className="leading-snug font-bold">
              {t('house.home.learned', { count: learned })}
            </h2>
            <p className="text-sm text-body">{t('house.home.learnedHint')}</p>
          </div>
          <Button asChild variant="outline" className="w-fit">
            <a href={hashFor('profile')}>
              {t('house.home.learnedAction')}
              <ArrowRight aria-hidden />
            </a>
          </Button>
        </HouseCard>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <EnergyCard checkIns={checkIns} />
        <WinsCard achievements={achievements} />
      </div>
      <ChangesCard />
      <ComingUp />
    </main>
  )
}

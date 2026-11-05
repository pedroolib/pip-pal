import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@renderer/api'
import { Button } from '@renderer/components/ui/button'
import { usePaused } from '@renderer/pause'
import { RoomScene } from './RoomScene'
import { Keys } from './parts'
import { useLoad } from './useLoad'

// Pip says hello once, the first time the House opens on this computer. A per-viewer nicety, so
// browser storage is enough; without it Pip just doesn't greet.
const GREETED = 'pip.house.greeted'
function firstVisit(): boolean {
  try {
    return localStorage.getItem(GREETED) === null
  } catch {
    return false
  }
}
function markGreeted(): void {
  try {
    localStorage.setItem(GREETED, '1')
  } catch {
    // Nothing to do: Pip greets again next time.
  }
}

function partOfDay(d: Date): 'morning' | 'afternoon' | 'evening' {
  const h = d.getHours()
  return h < 12 ? 'morning' : h < 19 ? 'afternoon' : 'evening'
}

/**
 * The top of Home: today's date, a greeting with the person's name, the one thing Pip does (with
 * its shortcut), and Pip himself. Pip greets in words on the first visit only.
 */
export function Room(): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const name = useLoad(() => api.getProfile()).data?.name?.trim()
  const [hello, setHello] = useState(firstVisit)
  const [paused] = usePaused()
  // Seen once is enough: the next visit is a calm room again.
  useEffect(() => {
    if (hello) markGreeted()
  }, [hello])
  const now = new Date()
  const date = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  }).format(now)
  const part = partOfDay(now)

  return (
    <header className="relative overflow-hidden rounded-card border bg-(image:--hero) p-6 shadow-card sm:p-7">
      <div className="flex items-center justify-between gap-6">
        <div className="min-w-0">
          <p className="text-sm font-bold text-muted-foreground first-letter:uppercase">{date}</p>
          <h1 className="mt-1 text-[1.75rem] leading-tight font-bold">
            {name
              ? t(`house.home.greeting.${part}Name`, { name })
              : t(`house.home.greeting.${part}`)}
          </h1>
          <p className="mt-2 max-w-[46ch] text-body">{t('house.home.heroBody')}</p>
          <div className="mt-4">
            <Keys />
          </div>
        </div>
        <div className="hidden shrink-0 min-[960px]:block">
          <RoomScene part={part} paused={paused} hello={hello} />
        </div>
      </div>
      {hello && (
        <div
          role="status"
          className="motion-swap mt-5 flex items-center gap-3 rounded-xl border bg-surface/80 px-4 py-3"
        >
          <p className="min-w-0 flex-1 text-[0.9375rem] text-body">{t('house.home.hello')}</p>
          <Button size="sm" variant="ghost" onClick={() => setHello(false)}>
            {t('house.home.helloDone')}
          </Button>
        </div>
      )}
    </header>
  )
}

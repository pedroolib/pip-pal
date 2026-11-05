import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Clock, Moon, Pause as PauseIcon, Play, Sunrise } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import { Pip } from '@renderer/pip/Pip'
import { pause, resume, usePaused, type Pause, type PauseLength } from '@renderer/pause'

const LENGTHS: { length: PauseLength; Icon: typeof Clock }[] = [
  { length: 'hour', Icon: Clock },
  { length: 'tomorrow', Icon: Sunrise },
  { length: 'resume', Icon: Moon }
]

/** "Until 10:30 PM" today, "Until Thu 8:00 AM" on another day, or "Until you resume". */
function useUntilLabel(p: Pause): string {
  const { t, i18n } = useTranslation()
  if (!p?.until) return t('house.pause.untilResume')
  const end = new Date(p.until)
  const sameDay = end.toDateString() === new Date().toDateString()
  const time = new Intl.DateTimeFormat(i18n.language, {
    ...(sameDay ? {} : { weekday: 'short' }),
    hour: 'numeric',
    minute: '2-digit'
  }).format(end)
  return t('house.pause.untilTime', { time })
}

/**
 * Pause Pip for an hour, until tomorrow, or until resumed; while paused, the same spot shows a
 * quiet Pip and Resume. `compact` is the sidebar version; the full one sits in Settings.
 */
export function PauseControl({ compact = false }: { compact?: boolean }): React.JSX.Element {
  const { t } = useTranslation()
  const [paused, p] = usePaused()
  const [choosing, setChoosing] = useState(false)
  const until = useUntilLabel(p)

  if (paused)
    return (
      <div
        role="status"
        className={cn(
          'motion-swap flex gap-3 rounded-xl border border-pip/40 bg-pip-soft',
          compact ? 'flex-col p-3' : 'items-center p-4'
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Pip mood="quiet" size={compact ? 30 : 40} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">{t('house.pause.paused')}</p>
            <p className="text-[0.8125rem] text-muted-foreground">
              {until}
              {!compact && <span className="hidden sm:inline"> · {t('house.pause.banner')}</span>}
            </p>
          </div>
        </div>
        <Button size="sm" className={cn(compact && 'w-full')} onClick={resume}>
          <Play aria-hidden />
          {t('house.pause.resumeNow')}
        </Button>
      </div>
    )

  if (choosing)
    return (
      <div
        role="group"
        aria-label={t('house.pause.choose')}
        className="motion-swap flex flex-col gap-1 rounded-xl border bg-surface p-1.5 shadow-card"
      >
        <p className="px-2 pt-1 pb-0.5 text-[0.8125rem] font-bold text-muted-foreground">
          {t('house.pause.choose')}
        </p>
        {LENGTHS.map(({ length, Icon }) => (
          <Button
            key={length}
            variant="ghost"
            size="sm"
            className="justify-start"
            autoFocus={length === 'hour'}
            onClick={() => {
              pause(length)
              setChoosing(false)
            }}
          >
            <Icon className="text-primary" aria-hidden />
            {t(`house.pause.${length}`)}
          </Button>
        ))}
        <Button
          variant="ghost"
          size="sm"
          className="justify-start text-muted-foreground"
          onClick={() => setChoosing(false)}
        >
          {t('house.pause.cancel')}
        </Button>
      </div>
    )

  return (
    <Button
      variant="outline"
      className={cn('justify-start', compact ? 'w-full' : 'w-fit')}
      onClick={() => setChoosing(true)}
    >
      <PauseIcon aria-hidden />
      {t('house.pause.button')}
    </Button>
  )
}

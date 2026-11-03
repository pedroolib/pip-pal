// Suggests one calming strategy from the person's manual before going back to step 1. Always skippable.
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CalmingStrategy } from '@shared/schemas'
import { api } from '@renderer/api'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Pip } from '@renderer/pip/Pip'

function Timer({ minutes, onEnd }: { minutes: number; onEnd: () => void }): React.JSX.Element {
  const { t } = useTranslation()
  const [left, setLeft] = useState(minutes * 60)
  useEffect(() => {
    if (left <= 0) {
      onEnd()
      return
    }
    const id = setTimeout(() => setLeft(left - 1), 1000)
    return () => clearTimeout(id)
  }, [left, onEnd])
  const mm = Math.floor(left / 60)
  const ss = String(left % 60).padStart(2, '0')
  return (
    <p className="text-3xl font-bold tabular-nums" aria-label={t('calm.left', { count: mm })}>
      {mm}:{ss}
    </p>
  )
}

export function CalmingCard({
  strategy,
  then,
  onDone
}: {
  strategy: CalmingStrategy
  /** What comes after, e.g. "step 1". */
  then: string
  /** Called on skip, when the timer ends, or when the person is ready early. */
  onDone: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [running, setRunning] = useState(false)
  const minutes = strategy.minutes
  // A failed write only loses the log entry; the flow goes on.
  const log = (status: 'used' | 'skipped'): void => {
    api.logEvent({ kind: 'calm', status, strategyId: strategy.id ?? null }).catch(() => {})
  }

  return (
    <Card className="min-h-0 w-full overflow-y-auto gap-4 p-5 shadow-lg">
      <div className="flex items-start gap-3">
        {/* While the timer runs Pip breathes at 4 s in, 4 s out, a pace to follow if it helps. */}
        <Pip mood={running ? 'quiet' : 'gentle'} size={44} />
        <div className="flex flex-col gap-1">
          <h1 className="font-bold">
            {t('calm.offer', { strategy: strategy.label, minutes, then })}
          </h1>
          <p className="text-sm text-body">
            {t(
              {
                self: 'calm.whySelf',
                onboarding: 'calm.whyOnboarding',
                learned: 'calm.whyLearned'
              }[strategy.origin]
            )}
          </p>
        </div>
      </div>
      {running ? (
        <>
          <Timer minutes={minutes} onEnd={onDone} />
          <Button size="lg" onClick={onDone}>
            {t('calm.ready')}
          </Button>
        </>
      ) : (
        <div className="flex gap-2">
          <Button
            size="lg"
            className="flex-1"
            onClick={() => {
              log('used')
              setRunning(true)
            }}
          >
            {t('calm.start', { minutes })}
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="flex-1"
            onClick={() => {
              log('skipped')
              onDone()
            }}
          >
            {t('calm.skip')}
          </Button>
        </div>
      )}
    </Card>
  )
}

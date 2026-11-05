import { useTranslation } from 'react-i18next'
import { HeartPulse, Lock, Watch } from 'lucide-react'
import { Badge } from '@renderer/components/ui/badge'
import { HouseCard, Page, SectionTitle } from './parts'

const NOW = [
  { key: 'appleWatch', Icon: Watch },
  { key: 'whoop', Icon: HeartPulse }
] as const

function ComingSoon(): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <Badge variant="outline" className="bg-muted">
      {t('house.connections.soon')}
    </Badge>
  )
}

/** One integration: icon, name and what it would do, with its status on the right. */
function Row({
  id,
  Icon,
  children
}: {
  id: string
  Icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  children: React.ReactNode
}): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <li className="flex items-start gap-3.5 py-4 not-first:border-t first:pt-1 last:pb-1">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h3 className="font-bold">{t(`house.connections.${id}.name`)}</h3>
          <ComingSoon />
        </div>
        {children}
      </div>
    </li>
  )
}

/** Nothing is connected, fetched or stored here: the rows only say what could come later. */
export function ConnectionsView(): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <Page title={t('house.titles.connections')}>
      <SectionTitle>{t('house.connections.now')}</SectionTitle>
      <HouseCard className="py-4">
        <ul>
          {NOW.map(({ key, Icon }) => (
            <Row key={key} id={key} Icon={Icon}>
              <p className="mt-0.5 text-[0.9375rem] text-body">
                {t(`house.connections.${key}.body`)}
              </p>
              <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                <Lock className="size-3.5" aria-hidden />
                {t('house.connections.local')}
              </p>
            </Row>
          ))}
        </ul>
      </HouseCard>
    </Page>
  )
}

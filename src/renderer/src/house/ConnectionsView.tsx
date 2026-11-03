import { useTranslation } from 'react-i18next'
import { HeartPulse, Mail, MessageSquare, Watch } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { HouseCard, Page } from './parts'

const NOW = [
  { key: 'appleWatch', Icon: Watch },
  { key: 'whoop', Icon: HeartPulse }
] as const
const LATER = [
  { key: 'email', Icon: Mail },
  { key: 'slack', Icon: MessageSquare }
] as const

function ComingSoon(): React.JSX.Element {
  const { t } = useTranslation()
  // Disabled buttons keep readable text: muted fill, muted-foreground text, no fading.
  return (
    <Button
      disabled
      className="min-h-11 w-fit rounded-full border bg-muted px-5 font-bold text-muted-foreground disabled:opacity-100"
    >
      {t('house.connections.soon')}
    </Button>
  )
}

/** Nothing is connected, fetched or stored here: the cards only say what could come later. */
export function ConnectionsView(): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <Page title={t('house.titles.connections')} intro={t('house.connections.intro')}>
      <h2 className="px-1 text-xl font-bold">{t('house.connections.now')}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {NOW.map(({ key, Icon }) => (
          <HouseCard key={key}>
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary">
                <Icon className="size-6" aria-hidden />
              </span>
              <h3 className="text-[1.0625rem] font-bold">{t(`house.connections.${key}.name`)}</h3>
            </div>
            <p>{t(`house.connections.${key}.body`)}</p>
            <p className="text-sm text-muted-foreground">{t('house.connections.local')}</p>
            <ComingSoon />
          </HouseCard>
        ))}
      </div>
      <h2 className="px-1 text-xl font-bold">{t('house.connections.later')}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {LATER.map(({ key, Icon }) => (
          <HouseCard key={key} className="p-4">
            <div className="flex items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary">
                <Icon className="size-5" aria-hidden />
              </span>
              <h3 className="font-bold">{t(`house.connections.${key}.name`)}</h3>
            </div>
            <p className="text-sm text-body">{t(`house.connections.${key}.body`)}</p>
            <ComingSoon />
          </HouseCard>
        ))}
      </div>
    </Page>
  )
}

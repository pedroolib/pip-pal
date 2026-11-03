import { useTranslation } from 'react-i18next'
import { Page } from './parts'

// Stub: WP3 replaces this with the real settings.
export function SettingsView(): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <Page title={t('house.titles.settings')}>
      <p className="px-1 text-muted-foreground">{t('house.settings.stub')}</p>
    </Page>
  )
}

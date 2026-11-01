// Placeholder that proves the theme, i18n and the mock API are wired. C replaces it with the real overlay.
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Decoded } from '@shared/schemas'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { api } from '@renderer/api'

function App(): React.JSX.Element {
  const { t } = useTranslation()
  const [decoded, setDecoded] = useState<Decoded | null>(null)

  useEffect(() => {
    api.decode('', null).then(setDecoded)
  }, [])

  if (!decoded) return <></>
  const steps = decoded.decode.steps

  return (
    <div className="p-8">
      <Card className="max-w-sm gap-3 p-5 shadow-lg">
        <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
          {t('card.now')} · {t('card.stepOf', { current: 1, total: steps.length })}
        </p>
        <h1 className="text-2xl font-bold">{steps[0].text}</h1>
        {steps[0].why && <p className="text-body">{steps[0].why}</p>}
        <div className="flex gap-2 pt-2">
          <Button size="lg" className="flex-1">
            {t('card.done')}
          </Button>
          <Button size="lg" variant="outline" className="flex-1">
            {t('card.stuck')}
          </Button>
        </div>
      </Card>
    </div>
  )
}

export default App

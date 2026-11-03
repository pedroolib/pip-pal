import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Keyboard, Languages, ShieldCheck, Sun, Sunrise, Sunset, Wind } from 'lucide-react'
import type { Settings, Slot } from '@shared/schemas'
import { api } from '@renderer/api'
import { Button } from '@renderer/components/ui/button'
import { Label } from '@renderer/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { Switch } from '@renderer/components/ui/switch'
import { HouseCard, Page } from './parts'
import { applySettings, isMac, shortcutKeys } from './settings'
import { useLoad } from './useLoad'

const SLOTS = [
  { slot: 'morning', Icon: Sunrise },
  { slot: 'midday', Icon: Sun },
  { slot: 'afternoon', Icon: Sunset }
] as const satisfies readonly { slot: Slot; Icon: unknown }[]

const iconChip = 'grid size-10 shrink-0 place-items-center rounded-full bg-secondary'

function Heading({
  Icon,
  children
}: {
  Icon: typeof Sun
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-3">
      <span className={iconChip}>
        <Icon className="size-6" aria-hidden />
      </span>
      <h2 className="text-[1.0625rem] leading-snug font-bold">{children}</h2>
    </div>
  )
}

/** Settings save as you make them. A failed save puts the control back and says so, calmly. */
export function SettingsView(): React.JSX.Element {
  const { t } = useTranslation()
  const { data, failed, reload } = useLoad(() => api.getSettings())
  const [saved, setSaved] = useState<Settings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const settings = saved ?? data

  const change = (key: string, next: Settings): void => {
    const prev = settings
    if (!prev) return
    setSaved(next)
    setError(null)
    applySettings(next)
    api.saveSettings(next).catch(() => {
      setSaved(prev)
      applySettings(prev)
      setError(key)
    })
  }
  const fail = (key: string): React.JSX.Element | null =>
    error === key ? (
      <p role="alert" className="text-sm text-body">
        {t('house.settings.saveFailed')}
      </p>
    ) : null

  const off = !settings
  const keys = shortcutKeys(isMac(navigator.platform || navigator.userAgent))
  const mac = keys[0] === '⌃'

  return (
    <Page title={t('house.titles.settings')} intro={t('house.settings.intro')}>
      {failed && (
        <HouseCard role="alert">
          <p>{t('house.settings.loadFailed')}</p>
          <Button
            onClick={reload}
            variant="outline"
            className="min-h-11 w-fit rounded-full border-2 px-5 font-bold"
          >
            {t('house.settings.retry')}
          </Button>
        </HouseCard>
      )}
      {off && !failed && (
        <p role="status" className="px-1 text-muted-foreground">
          {t('house.settings.loading')}
        </p>
      )}

      <HouseCard>
        <div>
          <h2 className="text-[1.0625rem] leading-snug font-bold">
            {t('house.settings.checkIns.title')}
          </h2>
          <p className="mt-1">{t('house.settings.checkIns.body')}</p>
        </div>
        <div>
          {SLOTS.map(({ slot, Icon }) => (
            <div
              key={slot}
              className="flex flex-wrap items-center gap-x-3.5 gap-y-1 border-border py-3 not-first:border-t"
            >
              <span className={iconChip}>
                <Icon className="size-6" aria-hidden />
              </span>
              <Label htmlFor={`slot-${slot}`} className="min-w-0 flex-1 flex-col items-start gap-0">
                <strong>{t(`house.settings.checkIns.${slot}`)}</strong>
                <span className="text-sm font-normal text-muted-foreground">
                  {t(`house.settings.checkIns.${slot}Time`)}
                </span>
              </Label>
              <Switch
                id={`slot-${slot}`}
                disabled={off}
                checked={settings?.checkIns[slot] ?? false}
                onCheckedChange={(on) =>
                  settings &&
                  change(slot, { ...settings, checkIns: { ...settings.checkIns, [slot]: on } })
                }
              />
              <div className="basis-full pl-[54px] empty:hidden">{fail(slot)}</div>
            </div>
          ))}
        </div>
      </HouseCard>

      <HouseCard>
        <Heading Icon={Keyboard}>{t('house.settings.shortcut.title')}</Heading>
        <div className="flex flex-wrap items-center gap-2">
          {keys.map((k, i) => (
            <span key={k} className="flex items-center gap-2">
              {i > 0 && !mac && <span aria-hidden>+</span>}
              <kbd className="rounded-[10px] border border-b-[3px] border-border bg-background px-3 py-2 text-[0.9375rem] leading-none font-bold">
                {k}
              </kbd>
            </span>
          ))}
        </div>
        <p>{t('house.settings.shortcut.body')}</p>
        <p className="text-sm text-muted-foreground">
          {t('house.settings.shortcut.fixed')}{' '}
          {!mac && <>{t('house.settings.shortcut.linux', { command: 'pip-pal --capture' })}</>}
        </p>
      </HouseCard>

      <div className="grid gap-4 sm:grid-cols-2">
        <HouseCard>
          <Heading Icon={Languages}>
            <Label htmlFor="language" className="text-[1.0625rem] leading-snug font-bold">
              {t('house.settings.language.title')}
            </Label>
          </Heading>
          <Select
            disabled={off}
            value={settings?.language ?? 'en'}
            onValueChange={(language) =>
              settings &&
              change('language', { ...settings, language: language as Settings['language'] })
            }
          >
            <SelectTrigger
              id="language"
              className="min-h-11 w-fit gap-2.5 rounded-full border-[1.5px] bg-surface px-4 font-bold"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">{t('house.settings.language.en')}</SelectItem>
              <SelectItem value="es">{t('house.settings.language.es')}</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">{t('house.settings.language.note')}</p>
          {fail('language')}
        </HouseCard>

        <HouseCard>
          <div className="flex items-center gap-3">
            <span className={iconChip}>
              <Wind className="size-6" aria-hidden />
            </span>
            <Label htmlFor="calm" className="flex-1 text-[1.0625rem] leading-snug font-bold">
              {t('house.settings.calm.title')}
            </Label>
            <Switch
              id="calm"
              disabled={off}
              checked={settings?.calmMotion ?? false}
              onCheckedChange={(calmMotion) =>
                settings && change('calm', { ...settings, calmMotion })
              }
            />
          </div>
          <p>{t('house.settings.calm.body')}</p>
          {fail('calm')}
        </HouseCard>
      </div>

      <HouseCard>
        <Heading Icon={ShieldCheck}>{t('house.settings.privacy.title')}</Heading>
        <p>{t('house.settings.privacy.selected')}</p>
        <p>{t('house.settings.privacy.manual')}</p>
      </HouseCard>
    </Page>
  )
}

// "How should Pip talk to you?" Shared by onboarding and Settings; the choice is Settings.tone.
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { REPLY_TONES, type Settings, type ReplyTone } from '@shared/schemas'
import { Label } from '@renderer/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@renderer/components/ui/radio-group'

export function TonePicker({
  settings,
  disabled,
  onChange
}: {
  settings: Settings | null
  disabled?: boolean
  onChange: (s: Settings) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const uid = useId()
  return (
    <RadioGroup
      aria-label={t('house.settings.tone.title')}
      disabled={disabled}
      value={settings?.tone ?? 'plain'}
      onValueChange={(tone) => settings && onChange({ ...settings, tone: tone as ReplyTone })}
    >
      {REPLY_TONES.map((tone) => (
        <div key={tone} className="flex items-start gap-3">
          <RadioGroupItem id={`${uid}-${tone}`} value={tone} className="mt-1 size-5" />
          <Label htmlFor={`${uid}-${tone}`} className="grid gap-0.5 font-normal">
            <span className="font-bold">{t(`house.settings.tone.${tone}.label`)}</span>
            <span className="text-sm text-muted-foreground">
              {t(`house.settings.tone.${tone}.example`)}
            </span>
          </Label>
        </div>
      ))}
    </RadioGroup>
  )
}

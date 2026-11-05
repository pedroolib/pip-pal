import { useTranslation } from 'react-i18next'
import { BookOpenText } from 'lucide-react'
import { Label } from '@renderer/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@renderer/components/ui/radio-group'
import { Switch } from '@renderer/components/ui/switch'
import { comfortPref, TEXT_SIZES, type TextSize } from '@renderer/comfort'
import { choice, HouseCard } from './parts'

/** Text size and roomier spacing, with a sample message that shows the result as you choose. */
export function ReadingComfort({
  heading
}: {
  /** Settings' own card heading (icon chip and title), so this card matches the others. */
  heading: (Icon: typeof BookOpenText, title: React.ReactNode) => React.ReactNode
}): React.JSX.Element {
  const { t } = useTranslation()
  const [comfort, setComfort] = comfortPref.use()
  return (
    <HouseCard className="gap-4">
      {heading(BookOpenText, t('house.settings.reading.title'))}
      <p className="text-sm text-muted-foreground">{t('house.settings.reading.body')}</p>

      <div className="grid gap-2.5">
        <p id="reading-size" className="text-sm font-bold text-body">
          {t('house.settings.reading.size')}
        </p>
        <RadioGroup
          aria-labelledby="reading-size"
          value={comfort.size}
          onValueChange={(size) => setComfort({ ...comfort, size: size as TextSize })}
          className="flex flex-wrap gap-2"
        >
          {TEXT_SIZES.map((size, i) => (
            <Label key={size} className={choice}>
              <RadioGroupItem value={size} />
              <span style={{ fontSize: `${0.875 + i * 0.125}rem` }}>
                {t(`house.settings.reading.sizes.${size}`)}
              </span>
            </Label>
          ))}
        </RadioGroup>
      </div>

      <div className="flex items-center justify-between gap-4">
        <Label htmlFor="reading-spacious" className="text-[0.9375rem] font-bold">
          {t('house.settings.reading.spacious')}
        </Label>
        <Switch
          id="reading-spacious"
          checked={comfort.spacious}
          onCheckedChange={(spacious) => setComfort({ ...comfort, spacious })}
        />
      </div>

      {/* Shows the choice on a real-looking message. */}
      <p
        aria-hidden
        className="rounded-xl border border-dashed border-input bg-background px-4 py-3 text-body"
      >
        {t('house.settings.reading.sample')}
      </p>
    </HouseCard>
  )
}

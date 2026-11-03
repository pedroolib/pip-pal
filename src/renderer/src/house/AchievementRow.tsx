import { CheckCheck, Compass, MessageCircleQuestion } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Achievement } from '@shared/schemas'
import { dayLabel, timeLabel } from './days'

const ICONS = {
  step_done: CheckCheck,
  change_navigated: Compass,
  asked_not_guessed: MessageCircleQuestion
} satisfies Record<Achievement['kind'], unknown>

/** Kind icon in a teal circle, the label, and the kind as words (never icon alone). */
export function AchievementRow({
  a,
  when
}: {
  a: Achievement
  when: 'time' | 'dayAndTime'
}): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const Icon = ICONS[a.kind]
  const time =
    when === 'time'
      ? timeLabel(a.at, i18n.language)
      : `${dayLabel(a.at, i18n.language)}, ${timeLabel(a.at, i18n.language)}`
  return (
    <div className="flex items-center gap-3.5">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-foreground">
        <Icon className="size-6" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-bold">{a.label}</p>
        <p className="text-sm text-muted-foreground">
          {t(`house.achievements.kinds.${a.kind}`)} · {time}
        </p>
      </div>
    </div>
  )
}

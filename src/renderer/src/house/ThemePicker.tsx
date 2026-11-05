import { useTranslation } from 'react-i18next'
import { Monitor, Moon, Sun } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { THEMES, useThemePref, type ThemePref } from '@renderer/theme'

const ICONS = { system: Monitor, light: Sun, dark: Moon } satisfies Record<ThemePref, unknown>

/**
 * System, Light or Dark as one segmented control (a radio group). `compact` shows icons only, for
 * the sidebar; each keeps its name for screen readers and as a tooltip.
 */
export function ThemePicker({
  compact = false,
  labelledBy
}: {
  compact?: boolean
  labelledBy?: string
}): React.JSX.Element {
  const { t } = useTranslation()
  const [pref, setPref] = useThemePref()
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : t('house.sidebar.theme')}
      className={cn(
        'relative grid grid-cols-3 gap-0.5 rounded-lg border bg-muted p-0.5',
        compact ? 'w-full' : 'w-fit'
      )}
    >
      {/* The thumb slides under the chosen option: a third of the row, minus padding and gaps. */}
      <span
        aria-hidden
        className="pointer-events-none absolute top-0.5 bottom-0.5 left-0.5 w-[calc((100%-0.5rem)/3)] rounded-md border border-primary/45 bg-primary/20 shadow-control transition-transform duration-300 ease-(--ease-out)"
        style={{ transform: `translateX(calc(${THEMES.indexOf(pref)} * (100% + 0.125rem)))` }}
      />
      {THEMES.map((theme) => {
        const Icon = ICONS[theme]
        const on = pref === theme
        const name = t(`house.settings.theme.${theme}`)
        return (
          <button
            key={theme}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={compact ? name : undefined}
            title={compact ? name : undefined}
            onClick={() => setPref(theme)}
            onKeyDown={(e) => {
              // Arrow keys move the choice, like any radio group.
              const step =
                e.key === 'ArrowRight' || e.key === 'ArrowDown'
                  ? 1
                  : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
                    ? -1
                    : 0
              if (!step) return
              e.preventDefault()
              const next = THEMES[(THEMES.indexOf(theme) + step + THEMES.length) % THEMES.length]
              setPref(next)
              ;(
                e.currentTarget.parentElement?.querySelector(
                  `[data-theme="${next}"]`
                ) as HTMLElement | null
              )?.focus()
            }}
            data-theme={theme}
            tabIndex={on ? 0 : -1}
            className={cn(
              'relative flex h-8 items-center justify-center gap-1.5 rounded-md text-sm font-bold transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-solid focus-visible:outline-ring',
              compact ? 'px-2' : 'px-3',
              on ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="size-4" aria-hidden />
            {!compact && name}
          </button>
        )
      })}
    </div>
  )
}

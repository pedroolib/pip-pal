// The menu the command shortcut opens when nothing is selected. A roving-focus list: the overlay window is
// never focused, so it asks for the keyboard while open and hands it back on close.
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bell, Home, Info, MessageCircle, Mic, Smile, type LucideIcon } from 'lucide-react'
import { api } from '@renderer/api'
import { Card } from '@renderer/components/ui/card'

export type CommandItem = 'home' | 'listen' | 'checkIn' | 'tell' | 'remind'

const ITEMS: [CommandItem, LucideIcon][] = [
  ['home', Home],
  ['listen', Mic],
  ['checkIn', Smile],
  ['tell', MessageCircle],
  ['remind', Bell]
]

export function CommandMenu({
  copyFailed,
  onPick,
  onClose
}: {
  copyFailed: boolean
  onPick: (item: CommandItem) => void
  onClose: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [index, setIndex] = useState(0)
  const rows = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    api.setOverlayFocus(true)
    return () => api.setOverlayFocus(false)
  }, [])
  useEffect(() => rows.current[index]?.focus(), [index])

  const onKeyDown = (e: React.KeyboardEvent): void => {
    const last = ITEMS.length - 1
    const next: Record<string, number> = {
      ArrowDown: index === last ? 0 : index + 1,
      ArrowUp: index === 0 ? last : index - 1,
      Home: 0,
      End: last
    }
    if (e.key === 'Escape') onClose()
    else if (e.key in next) setIndex(next[e.key])
    else return
    e.preventDefault()
  }

  return (
    <Card
      role="menu"
      aria-label={t('command.label')}
      onKeyDown={onKeyDown}
      className="w-80 max-w-full gap-0.5 p-2 shadow-lg"
    >
      {copyFailed && (
        <p
          role="status"
          className="mb-1.5 flex items-start gap-2 rounded-lg bg-secondary/60 p-3 text-sm"
        >
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
          {t('command.cantRead')}
        </p>
      )}
      {ITEMS.map(([item, Icon], i) => (
        <button
          key={item}
          ref={(el) => {
            rows.current[i] = el
          }}
          type="button"
          role="menuitem"
          tabIndex={i === index ? 0 : -1}
          onFocus={() => setIndex(i)}
          onClick={() => onPick(item)}
          className="group flex min-h-12 w-full items-center gap-3 rounded-md border border-transparent px-3 py-1.5 text-left outline-none hover:bg-accent focus-visible:border-ring focus-visible:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Icon aria-hidden className="size-5 shrink-0 text-primary" />
          <span className="flex flex-col">
            <span className="text-base leading-snug font-bold">
              {t(`command.items.${item}.name`)}
            </span>
            <span className="text-sm leading-tight text-muted-foreground group-hover:text-body group-focus-visible:text-body">
              {t(`command.items.${item}.hint`)}
            </span>
          </span>
        </button>
      ))}
      <p className="flex flex-wrap gap-x-3.5 px-3 pt-2 pb-1 text-xs text-muted-foreground">
        {(
          [
            ['↑↓', 'move'],
            ['Enter', 'pick'],
            ['Esc', 'close']
          ] as const
        ).map(([key, what]) => (
          <span key={what} className="inline-flex items-center gap-1">
            <kbd className="rounded-md border bg-card px-1.5 py-px text-xs font-bold text-body shadow-[0_1px_0_var(--border)]">
              {key}
            </kbd>
            {t(`command.keys.${what}`)}
          </span>
        ))}
      </p>
    </Card>
  )
}

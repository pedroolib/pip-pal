// The menu the command shortcut opens when nothing is selected. The overlay window is never focused, so it asks for
// the keyboard while open and hands it back on close; main also catches the menu's keys, as Windows may refuse it.
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bell, Home, Info, MessageCircle, Mic, Smile, type LucideIcon } from 'lucide-react'
import { api } from '@renderer/api'
import { Card } from '@renderer/components/ui/card'
import { cn } from '@renderer/lib/utils'
import { Pip } from '@renderer/pip/Pip'
import { PIP_SIZE, type Flip } from '@renderer/triage/model'
import { menuMove } from './menuMove'
import { MOOD } from './moods'

export type CommandItem = 'home' | 'listen' | 'checkIn' | 'tell' | 'remind'

const ITEMS: [CommandItem, LucideIcon][] = [
  ['home', Home],
  ['listen', Mic],
  ['checkIn', Smile],
  ['tell', MessageCircle],
  ['remind', Bell]
]

export function CommandMenu({
  flip = { x: false, y: false },
  copyFailed,
  onPick,
  onClose
}: {
  /** Pip stays where the reading Pip was: right of the card, left when flipped on x, below when on y. */
  flip?: Flip
  copyFailed: boolean
  onPick: (item: CommandItem) => void
  onClose: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  // Mouse first, as in a native menu: nothing is selected until the pointer moves over a row or a key is pressed, and
  // the selection then belongs to whichever of the two was used last.
  const [index, setIndex] = useState<number | null>(null)
  // The focus ring is for the keyboard; the pointer only tints the row it is over.
  const [byKeys, setByKeys] = useState(false)
  const rows = useRef<(HTMLButtonElement | null)[]>([])
  // Where the pointer last was. A card that appears or moves under a resting pointer makes the browser fire a
  // mouse move with no movement; that must not select a row, or the menu would pick itself like a key press.
  const pointer = useRef<{ x: number; y: number } | null>(null)
  const moved = (e: React.MouseEvent): boolean => {
    const last = pointer.current
    pointer.current = { x: e.screenX, y: e.screenY }
    return !last || last.x !== e.screenX || last.y !== e.screenY
  }

  useEffect(() => {
    api.setOverlayFocus(true)
    api.setMenuKeysWanted(true)
    return () => {
      api.setOverlayFocus(false)
      api.setMenuKeysWanted(false)
    }
  }, [])
  useEffect(() => {
    // Focus follows the keyboard only: the pointer tints the row but must not move focus, or hovering looks like tabbing.
    if (index === null) (document.activeElement as HTMLElement | null)?.blur()
    else if (byKeys) rows.current[index]?.focus()
  }, [index, byKeys])

  // Whether the key was one of the menu's.
  const press = (key: string): boolean => {
    const next = menuMove(key, index, ITEMS.length)
    if (next !== null) {
      setByKeys(true)
      setIndex(next)
    } else if (key === 'Escape') onClose()
    else if (key === 'Enter') {
      if (index !== null) onPick(ITEMS[index][0])
    } else return false
    return true
  }
  // Main catches these keys while the menu is open; the page only hears them itself in a plain browser, or if the
  // OS would not let main have them.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (press(e.key === 'Tab' && e.shiftKey ? 'Shift+Tab' : e.key)) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    const offMenuKey = api.onMenuKey(press)
    return () => {
      window.removeEventListener('keydown', onKey)
      offMenuKey()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `press` only reads `index`
  }, [index, onPick])

  return (
    <div
      className={cn(
        'flex max-w-full gap-2',
        flip.x && 'flex-row-reverse',
        flip.y ? 'items-end' : 'items-start'
      )}
    >
      <Pip
        mood={index === null ? 'hello' : MOOD[ITEMS[index][0]]}
        size={PIP_SIZE}
        className={flip.y ? 'mb-3' : 'mt-3'}
      />
      <Card
        role="menu"
        aria-label={t('command.label')}
        onMouseMove={(e) => {
          if (!moved(e)) return
          setByKeys(false)
          // The selection follows the pointer, so hover and keyboard never mark two rows at once.
          const row = (e.target as HTMLElement).closest<HTMLElement>('[data-row]')
          if (row) setIndex(Number(row.dataset.row))
        }}
        onMouseLeave={() => !byKeys && setIndex(null)}
        data-keys={byKeys}
        className="group/menu w-80 max-w-full gap-0.5 p-2 shadow-float"
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
            tabIndex={i === (index ?? 0) ? 0 : -1}
            data-active={i === index}
            data-row={i}
            onClick={() => onPick(item)}
            className="group flex min-h-12 w-full items-center gap-3 rounded-md border border-transparent px-3 py-1.5 text-left outline-none data-[active=true]:bg-accent group-data-[keys=true]/menu:data-[active=true]:border-ring group-data-[keys=true]/menu:data-[active=true]:ring-[3px] group-data-[keys=true]/menu:data-[active=true]:ring-ring/50"
          >
            <Icon aria-hidden className="size-5 shrink-0 text-primary" />
            <span className="flex flex-col">
              <span className="text-base leading-snug font-bold">
                {t(`command.items.${item}.name`)}
              </span>
              <span className="text-sm leading-tight text-muted-foreground group-data-[active=true]:text-body">
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
    </div>
  )
}

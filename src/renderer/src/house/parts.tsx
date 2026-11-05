import { Card } from '@renderer/components/ui/card'
import { cn } from '@renderer/lib/utils'
import { isMac, shortcutKeys } from './settings'

/** The House's panel: off-white, hairline border, barely-there shadow. */
export function HouseCard({ className, ...props }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <Card {...props} className={cn('gap-3 rounded-card bg-surface p-5 shadow-card', className)} />
  )
}

/** One option in a row of choices (a radio or checkbox inside a Label): a quiet segmented look. */
export const choice =
  'h-10 cursor-pointer gap-2.5 rounded-lg border border-input bg-surface px-3.5 text-[0.9375rem] font-bold text-body transition-colors hover:border-border-strong has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-ring has-data-[state=checked]:border-primary has-data-[state=checked]:bg-secondary has-data-[state=checked]:text-secondary-foreground'

/** A section heading inside a page: small, bold, quiet. */
export function SectionTitle({
  className,
  ...props
}: React.ComponentProps<'h2'>): React.JSX.Element {
  return (
    <h2
      {...props}
      className={cn('px-0.5 pt-2 text-[0.9375rem] font-bold text-foreground', className)}
    />
  )
}

/** Wide windows centre the content at 760px, a comfortable line length. */
export function Page({
  title,
  intro,
  children
}: {
  title: string
  intro?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <main className="mx-auto flex w-full max-w-[760px] min-w-0 flex-col gap-4 px-5 pt-8 pb-12 md:px-10 md:pt-12">
      <header className="mb-2 flex flex-col gap-1.5">
        <h1 className="text-[1.75rem] leading-tight font-bold">{title}</h1>
        {intro && <p className="max-w-[60ch] text-body">{intro}</p>}
      </header>
      {children}
    </main>
  )
}

/** The capture shortcut as key caps, in this computer's spelling (⌃ ⇧ on a Mac, Ctrl + Shift elsewhere). */
export function Keys({ small = false }: { small?: boolean }): React.JSX.Element {
  const mac = isMac(navigator.platform || navigator.userAgent)
  return (
    <span className={cn('inline-flex flex-wrap items-center', small ? 'gap-1' : 'gap-1.5')}>
      {shortcutKeys(mac).map((k, i) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          {i > 0 && !mac && !small && (
            <span aria-hidden className="text-muted-foreground">
              +
            </span>
          )}
          <kbd
            className={cn(
              'rounded-md border border-b-2 border-input bg-surface font-mono leading-none font-bold text-body',
              small ? 'px-1.5 py-1 text-xs' : 'px-2.5 py-1.5 text-sm'
            )}
          >
            {k}
          </kbd>
        </span>
      ))}
    </span>
  )
}

import { Card } from '@renderer/components/ui/card'
import { cn } from '@renderer/lib/utils'

/** The House's white, rounded card with a soft navy shadow. */
export function HouseCard({ className, ...props }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <Card {...props} className={cn('gap-3.5 rounded-card bg-surface p-5 shadow-card', className)} />
  )
}

/** Wide windows centre the content at 880px. */
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
    <main className="mx-auto flex w-full max-w-[880px] min-w-0 flex-col gap-5 p-4 pb-8">
      <header className="flex flex-col gap-1.5 px-1 pt-2">
        <h1 className="text-[1.75rem] leading-tight font-bold">{title}</h1>
        {intro && <p className="text-body">{intro}</p>}
      </header>
      {children}
    </main>
  )
}

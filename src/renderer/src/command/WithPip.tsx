// A command card with Pip beside it, outside the card, on the side the cursor leaves room (as in the record flow).
import { cn } from '@renderer/lib/utils'
import { Pip, type Mood } from '@renderer/pip/Pip'
import { PIP_SIZE, type Flip } from '@renderer/triage/model'

export function WithPip({
  mood,
  flip = { x: false, y: false },
  children
}: {
  mood: Mood
  flip?: Flip
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex max-w-full gap-2',
        flip.x && 'flex-row-reverse',
        flip.y ? 'items-end' : 'items-start'
      )}
    >
      <Pip mood={mood} size={PIP_SIZE} className={flip.y ? 'mb-3' : 'mt-3'} />
      {children}
    </div>
  )
}

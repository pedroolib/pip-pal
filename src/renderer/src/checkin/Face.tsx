import { Pip, type Mood } from '@renderer/pip/Pip'

// Energy 1 (almost empty) to 5 (full) as Pip's own faces, index 0 = level 1.
const MOODS: Mood[] = ['sleepy', 'gentle', 'calm', 'happy', 'celebrate']

// Without `className` the face is `size` px; with one (e.g. `w-full h-auto`) the CSS sizes it.
export function Face({
  level,
  size,
  className
}: {
  level: number
  size?: number
  className?: string
}): React.JSX.Element {
  return <Pip mood={MOODS[level - 1]} size={size} className={className} />
}

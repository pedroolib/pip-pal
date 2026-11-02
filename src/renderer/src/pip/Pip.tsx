// Pip, the character. Placeholder art until the redraw lands (docs/design/README.md): keep every
// drawing in this file so the new SVGs replace the shapes without touching callers.
import { useTranslation } from 'react-i18next'
import { cn } from '@renderer/lib/utils'

export type Mood =
  | 'calm'
  | 'thinking'
  | 'happy'
  | 'gentle'
  | 'showing'
  | 'quiet'
  | 'hello'
  | 'celebrate'
  | 'sleepy'
  | 'reading'
  | 'listening'
  | 'thanks'

const INK = 'var(--foreground)'
const ACCENT = 'var(--primary)'

// Eyes sit at x 24 and 40 on a 64×64 canvas; the body spans 6–58 × 10–54.
const dots = (dx = 0, dy = 0): React.JSX.Element => (
  <g className="pip-blink">
    <ellipse cx={24 + dx} cy={32 + dy} rx={3} ry={4} fill={INK} />
    <ellipse cx={40 + dx} cy={32 + dy} rx={3} ry={4} fill={INK} />
  </g>
)

const arcs = (
  <g fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round">
    <path d="M18 34 q6 -7 12 0" />
    <path d="M34 34 q6 -7 12 0" />
  </g>
)

const sparkle = (x: number, y: number, r: number): React.JSX.Element => (
  <path
    key={`${x}-${y}`}
    d={`M${x} ${y - r} Q${x} ${y} ${x + r} ${y} Q${x} ${y} ${x} ${y + r} Q${x} ${y} ${x - r} ${y} Q${x} ${y} ${x} ${y - r}Z`}
    fill={ACCENT}
  />
)

function Face({ mood }: { mood: Mood }): React.JSX.Element {
  switch (mood) {
    case 'thinking':
      return (
        <>
          {dots(0, -3)}
          <g fill={INK}>
            <circle cx={26} cy={43} r={1.5} opacity={0.4} />
            <circle cx={32} cy={43} r={1.5} opacity={0.7} />
            <circle cx={38} cy={43} r={1.5} />
          </g>
        </>
      )
    case 'happy':
      return arcs
    case 'celebrate':
      return (
        <>
          {arcs}
          {[sparkle(3, 14, 4), sparkle(61, 8, 5), sparkle(60, 52, 3)]}
          <circle cx={56} cy={4} r={1.5} fill={ACCENT} />
          <circle cx={4} cy={54} r={1.5} fill={ACCENT} />
        </>
      )
    case 'thanks':
      return (
        <>
          {arcs}
          <ellipse cx={18} cy={40} rx={4} ry={2} fill="white" opacity={0.4} />
          <ellipse cx={46} cy={40} rx={4} ry={2} fill="white" opacity={0.4} />
        </>
      )
    case 'gentle':
      // Soft, slightly lowered eyes with kind (raised) brows: a check-in must never look like scolding.
      return (
        <>
          {dots(0, 2)}
          <g fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" opacity={0.7}>
            <path d="M20 25 q4 -2 8 0" />
            <path d="M36 25 q4 -2 8 0" />
          </g>
        </>
      )
    case 'showing':
      return dots(-3, 2)
    case 'quiet':
      return (
        <g stroke={INK} strokeWidth={3} strokeLinecap="round">
          <path d="M19 32 h10" />
          <path d="M35 32 h10" />
        </g>
      )
    case 'sleepy':
      return (
        <>
          <g fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round">
            <path d="M18 32 q6 5 12 0" />
            <path d="M34 32 q6 5 12 0" />
          </g>
          <text x={52} y={10} fontSize={12} fontWeight={700} fill={ACCENT}>
            z
          </text>
        </>
      )
    case 'reading':
      return (
        <>
          <g fill="none" stroke={INK} strokeWidth={2.5}>
            <circle cx={24} cy={32} r={6} />
            <circle cx={40} cy={32} r={6} />
            <path d="M30 32 h4" />
          </g>
          {dots()}
        </>
      )
    case 'hello':
      return (
        <>
          {dots()}
          <ellipse cx={60} cy={30} rx={4} ry={6} fill="var(--pip)" transform="rotate(20 60 30)" />
          <path d="M62 14 l-3 4" stroke={ACCENT} strokeWidth={2} strokeLinecap="round" />
        </>
      )
    case 'listening':
      return (
        <>
          {dots()}
          <g fill="none" stroke={ACCENT} strokeWidth={2} strokeLinecap="round">
            <path d="M61 26 q3 6 0 12" />
          </g>
        </>
      )
    case 'calm':
      return dots()
  }
}

/** One shape, the eyes do the talking. Bobs and blinks; still when reduced motion is on. */
export function Pip({
  mood,
  size = 48,
  className
}: {
  mood: Mood
  size?: number
  className?: string
}): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <svg
      viewBox="0 0 64 64"
      width={`${size / 16}rem`}
      height={`${size / 16}rem`}
      overflow="visible"
      role="img"
      aria-label={t(`pip.moods.${mood}`)}
      data-overlay-hit
      className={cn('pip-bob shrink-0', className)}
    >
      <rect
        x={6}
        y={10}
        width={52}
        height={44}
        rx={18}
        fill="var(--pip)"
        opacity={mood === 'quiet' ? 0.6 : 1}
      />
      {mood !== 'quiet' && <ellipse cx={18} cy={17} rx={5} ry={2.5} fill="white" opacity={0.45} />}
      <Face mood={mood} />
    </svg>
  )
}

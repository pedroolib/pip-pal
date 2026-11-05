// Pip, the character. Placeholder art until the redraw lands (docs/design/README.md): keep every
// drawing in this file so the new SVGs replace the shapes without touching callers.
import { useId } from 'react'
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

// Moods worth a small squash-and-settle when Pip changes into them.
const REACTS: Mood[] = ['happy', 'celebrate', 'thanks', 'hello']

const INK = 'var(--pip-ink)'
const ACCENT = 'var(--primary)'

// Idle motion for the open eyes (main.css): glancing around, pondering upward, reading a line, or
// darting toward what Pip is showing.
type Gaze = 'pip-look' | 'pip-ponder' | 'pip-scan' | 'pip-point'

// Eyes sit at x 24 and 40 on a 64×64 canvas; the body spans 6–58 × 10–54.
// Two groups, because the gaze moves the eyes while the blink squashes them.
const dots = (dx = 0, dy = 0, gaze: Gaze = 'pip-look'): React.JSX.Element => (
  <g className={gaze}>
    <g className="pip-blink">
      <ellipse cx={24 + dx} cy={32 + dy} rx={3} ry={4} fill={INK} />
      <ellipse cx={40 + dx} cy={32 + dy} rx={3} ry={4} fill={INK} />
    </g>
  </g>
)

// Smiling closed eyes; they lift a little now and then, like a contented hum.
const arcs = (
  <g fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" className="pip-content">
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
          {dots(0, -3, 'pip-ponder')}
          <g fill={INK} className="pip-dots">
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
          <g className="pip-twinkle">
            {[sparkle(3, 14, 4), sparkle(61, 8, 5), sparkle(60, 52, 3)]}
            <circle cx={56} cy={4} r={1.5} fill={ACCENT} />
            <circle cx={4} cy={54} r={1.5} fill={ACCENT} />
          </g>
        </>
      )
    case 'thanks':
      return (
        <>
          {arcs}
          <g className="pip-blush">
            <ellipse cx={18} cy={40} rx={4} ry={2} fill="white" opacity={0.4} />
            <ellipse cx={46} cy={40} rx={4} ry={2} fill="white" opacity={0.4} />
          </g>
        </>
      )
    case 'gentle':
      // Soft, slightly lowered eyes with kind (raised) brows: a check-in must never look like scolding.
      return (
        <>
          {dots(0, 2)}
          <g
            fill="none"
            stroke={INK}
            strokeWidth={2}
            strokeLinecap="round"
            opacity={0.7}
            className="pip-brow"
          >
            <path d="M20 25 q4 -2 8 0" />
            <path d="M36 25 q4 -2 8 0" />
          </g>
        </>
      )
    case 'showing':
      return dots(-3, 2, 'pip-point')
    case 'quiet':
      return (
        <g stroke={INK} strokeWidth={3} strokeLinecap="round" className="pip-rest">
          <path d="M19 32 h10" />
          <path d="M35 32 h10" />
        </g>
      )
    case 'sleepy':
      return (
        <>
          <g fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" className="pip-droop">
            <path d="M18 32 q6 5 12 0" />
            <path d="M34 32 q6 5 12 0" />
          </g>
          <text x={52} y={10} fontSize={12} fontWeight={700} fill={ACCENT} className="pip-z">
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
          {dots(0, 0, 'pip-scan')}
        </>
      )
    case 'hello':
      return (
        <>
          {dots()}
          {/* The hand waves from the wrist; the little motion mark pulses with it. */}
          <g className="pip-wave">
            <ellipse cx={60} cy={30} rx={4} ry={6} fill="var(--pip)" transform="rotate(20 60 30)" />
          </g>
          <path
            d="M62 14 l-3 4"
            stroke={ACCENT}
            strokeWidth={2}
            strokeLinecap="round"
            className="pip-pulse"
          />
        </>
      )
    case 'listening':
      return (
        <>
          {dots()}
          <g
            fill="none"
            stroke={ACCENT}
            strokeWidth={2}
            strokeLinecap="round"
            className="pip-pulse"
          >
            <path d="M61 26 q3 6 0 12" />
          </g>
        </>
      )
    case 'calm':
      return dots()
  }
}

// How the whole body idles in each mood (main.css). Quiet has none: it breathes slowly instead.
const BODY: Record<Mood, string | undefined> = {
  calm: 'pip-sway', // leans toward where he glances
  gentle: 'pip-sway',
  hello: 'pip-sway',
  showing: 'pip-lean', // leans toward what he points at
  listening: 'pip-tilt', // head tilted, attentive
  thinking: 'pip-muse', // tilts side to side with his eyes
  reading: 'pip-follow', // follows the line he reads
  happy: 'pip-rock', // a gentle content rock
  thanks: 'pip-rock',
  celebrate: 'pip-hop', // a small happy hop
  sleepy: 'pip-nod', // nods off, catches himself
  quiet: undefined
}

/** A steady per-instance offset (0 to -13 s) so Pips on screen together idle out of step. */
function offsetFor(id: string): string {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return `-${((h % 1300) / 100).toFixed(2)}s`
}

/**
 * One shape, the eyes do the talking. Idles on its own (floats, breathes, blinks, glances
 * around), reacts to a happy mood and breathes slowly while quiet. Still when reduced motion or
 * Calmer motion is on, and as a logo (`decorative`).
 */
export function Pip({
  mood,
  size = 48,
  className,
  decorative = false
}: {
  mood: Mood
  size?: number
  className?: string
  /** A logo-sized Pip beside his name: hidden from screen readers and still. */
  decorative?: boolean
}): React.JSX.Element {
  const { t } = useTranslation()
  const offset = offsetFor(useId())
  return (
    <svg
      viewBox="0 0 64 64"
      width={`${size / 16}rem`}
      height={`${size / 16}rem`}
      overflow="visible"
      {...(decorative
        ? { 'aria-hidden': true }
        : { role: 'img', 'aria-label': t(`pip.moods.${mood}`), 'data-overlay-hit': true })}
      style={{ '--pip-offset': offset } as React.CSSProperties}
      className={cn('pip shrink-0', decorative ? 'pip-still' : 'pip-bob', className)}
    >
      {/* Keyed by mood: a new mood remounts the group, so its reaction plays once. */}
      <g
        key={mood}
        className={cn(REACTS.includes(mood) && 'pip-react', mood === 'quiet' && 'pip-breathe')}
      >
        <g className={BODY[mood]}>
          <g className="pip-breath">
            <rect
              x={6}
              y={10}
              width={52}
              height={44}
              rx={18}
              fill="var(--pip)"
              opacity={mood === 'quiet' ? 0.6 : 1}
            />
            {mood !== 'quiet' && (
              <ellipse cx={18} cy={17} rx={5} ry={2.5} fill="white" opacity={0.45} />
            )}
            <Face mood={mood} />
          </g>
        </g>
      </g>
    </svg>
  )
}

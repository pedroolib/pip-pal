import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pip, type Mood } from '@renderer/pip/Pip'

type Part = 'morning' | 'afternoon' | 'evening'

const PIP_SIZE = 80
// Where Pip's feet land in the scene (viewBox units, 280 × 176).
const FLOOR_Y = 150
// Pip's body ends 54/64 down his own box.
const FEET = (PIP_SIZE * 54) / 64

// Small things Pip does on his own now and then, by time of day. He always comes back to calm.
const MOMENTS: Record<Part, Mood[]> = {
  morning: ['hello', 'thinking', 'happy', 'reading'],
  afternoon: ['thinking', 'reading', 'happy', 'hello'],
  evening: ['sleepy', 'thinking', 'reading', 'happy']
}

function motionAllowed(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false
  return !document.documentElement.classList.contains('calm-motion')
}

type Spark = { id: number; x: number; dx: number }

/**
 * Pip's little room, a living corner of the Home hero. A window shows the sky for the time of day
 * (drifting clouds, a bird that passes now and then, stars at night), a mug steams on a shelf, a
 * plant sways, dust floats in the light and a lamp can be switched on. Pip does small things on his
 * own, leans toward the pointer and hops when poked. Everything is decoration: the only controls
 * are Pip, the lamp and the plant, each a real button. Still when motion is reduced.
 */
export function RoomScene({
  part,
  paused,
  hello
}: {
  part: Part
  paused: boolean
  hello: boolean
}): React.JSX.Element {
  const { t } = useTranslation()
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const night = part === 'evening'
  const [lamp, setLamp] = useState(night)
  const [moment, setMoment] = useState<Mood | null>(null)
  const [poked, setPoked] = useState(false)
  const [sparks, setSparks] = useState<Spark[]>([])
  const [wiggle, setWiggle] = useState(0)
  const [streak, setStreak] = useState(0)
  const nextId = useRef(0)
  const pokeTimer = useRef<number | undefined>(undefined)
  const leanRef = useRef<HTMLDivElement>(null)

  // A small moment every so often, never while paused or while Pip is being poked.
  useEffect(() => {
    if (paused || !motionAllowed()) return
    let timer: number
    let back: number
    const schedule = (): void => {
      timer = window.setTimeout(
        () => {
          const options = MOMENTS[part]
          setMoment(options[Math.floor(Math.random() * options.length)])
          back = window.setTimeout(() => {
            setMoment(null)
            schedule()
          }, 4200)
        },
        8000 + Math.random() * 6000
      )
    }
    schedule()
    return () => {
      window.clearTimeout(timer)
      window.clearTimeout(back)
      setMoment(null)
    }
  }, [paused, part])

  useEffect(() => () => window.clearTimeout(pokeTimer.current), [])

  const poke = useCallback(() => {
    if (paused) return
    setStreak((n) => n + 1)
    const id = nextId.current++
    const dx = Math.round((Math.random() - 0.5) * 36)
    setSparks((s) => [...s.slice(-4), { id, x: 0, dx }])
    window.setTimeout(() => setSparks((s) => s.filter((p) => p.id !== id)), 1300)
    setPoked(true)
    window.clearTimeout(pokeTimer.current)
    pokeTimer.current = window.setTimeout(() => {
      setPoked(false)
      setStreak(0)
    }, 1800)
  }, [paused])

  const lean = (e: React.PointerEvent<HTMLDivElement>): void => {
    const box = e.currentTarget.getBoundingClientRect()
    const r = (e.clientX - box.left) / box.width - 0.5
    leanRef.current?.style.setProperty('--lean', String(Math.max(-1, Math.min(1, r * 2))))
  }
  const unlean = (): void => leanRef.current?.style.setProperty('--lean', '0')

  const mood: Mood = paused
    ? 'quiet'
    : poked
      ? streak >= 5
        ? 'celebrate'
        : 'happy'
      : (moment ?? (hello ? 'hello' : 'calm'))

  const lampOn = lamp && !paused
  const clip = `room-win-${uid}`
  const glow = `room-glow-${uid}`
  const sky = `room-sky-${uid}`

  return (
    <div
      role="group"
      aria-label={t('house.home.scene.label')}
      className="shrink-0 rounded-2xl border bg-surface/70"
      style={{
        position: 'relative',
        width: 280,
        height: 176,
        contain: 'paint',

        overflow: 'hidden'
      }}
      onPointerMove={lean}
      onPointerLeave={unlean}
    >
      <svg
        viewBox="0 0 280 176"
        width={280}
        height={176}
        aria-hidden="true"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      >
        <defs>
          <clipPath id={clip}>
            <rect x={24} y={14} width={96} height={80} rx={10} />
          </clipPath>
          <linearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
            {night ? (
              <>
                <stop offset="0" stopColor="#1f2d44" />
                <stop offset="1" stopColor="#3b5679" />
              </>
            ) : (
              <>
                <stop offset="0" stopColor="#bcd9ee" />
                <stop offset="1" stopColor="#eaf3f9" />
              </>
            )}
          </linearGradient>
          <radialGradient id={glow}>
            <stop offset="0" stopColor="#ffffff" stopOpacity={0.75} />
            <stop offset="1" stopColor="#ffffff" stopOpacity={0} />
          </radialGradient>
        </defs>

        {/* Floor and rug */}
        <rect x={0} y={138} width={280} height={38} fill="var(--tab-home)" opacity={0.12} />
        <ellipse cx={140} cy={156} rx={72} ry={11} fill="var(--tab-home)" opacity={0.3} />
        <ellipse
          cx={140}
          cy={156}
          rx={56}
          ry={7.5}
          fill="none"
          stroke="var(--tab-home)"
          opacity={0.5}
        />

        {/* Window with the sky */}
        <g clipPath={`url(#${clip})`}>
          <rect x={24} y={14} width={96} height={80} fill={`url(#${sky})`} />
          {night ? (
            <>
              <circle cx={92} cy={38} r={11} fill="#e8eef6" />
              <circle cx={97} cy={35} r={10} fill="#2a3d59" opacity={0.9} />
              {[
                [44, 28, 0],
                [62, 46, 1.2],
                [78, 24, 2.1],
                [50, 66, 0.6],
                [104, 62, 1.8]
              ].map(([x, y, d]) => (
                <circle
                  key={`${x}-${y}`}
                  className="scene-star"
                  cx={x}
                  cy={y}
                  r={1.5}
                  fill="#ffffff"
                  style={{ animationDelay: `${d}s` }}
                />
              ))}
            </>
          ) : (
            <>
              <circle cx={94} cy={36} r={22} fill={`url(#${glow})`} />
              <circle cx={94} cy={36} r={9} fill="#ffffff" opacity={0.95} />
              <g
                className="scene-cloud"
                style={{ animationDuration: '46s', animationDelay: '-12s' }}
              >
                <path d="M30 56 q4 -9 13 -6 q5 -8 14 -2 q9 -2 9 8 z" fill="#ffffff" opacity={0.9} />
              </g>
              <g
                className="scene-cloud"
                style={{ animationDuration: '70s', animationDelay: '-40s' }}
              >
                <path d="M30 30 q3 -6 9 -4 q4 -6 10 -1 q7 -1 7 5 z" fill="#ffffff" opacity={0.7} />
              </g>
              <g className="scene-bird">
                <path
                  d="M0 0 q4 -5 8 0 q4 -5 8 0"
                  fill="none"
                  stroke="#4a6a8c"
                  strokeWidth={1.6}
                  strokeLinecap="round"
                />
              </g>
            </>
          )}
        </g>
        <rect
          x={24}
          y={14}
          width={96}
          height={80}
          rx={10}
          fill="none"
          stroke="var(--border-strong)"
          strokeWidth={3}
        />
        <path d="M72 14 V94 M24 54 H120" stroke="var(--border-strong)" strokeWidth={2} />

        {/* Shelf, books and the steaming mug */}
        <rect x={172} y={66} width={92} height={5} rx={2.5} fill="var(--border-strong)" />
        <rect x={178} y={44} width={9} height={22} rx={2} fill="var(--tab-profile)" />
        <rect x={188} y={50} width={8} height={16} rx={2} fill="var(--tab-connections)" />
        <rect x={197} y={46} width={9} height={20} rx={2} fill="var(--tab-achievements)" />
        <g>
          <rect x={232} y={50} width={15} height={16} rx={4} fill="var(--tab-home)" />
          <path
            d="M247 54 q7 0 7 5 q0 5 -7 5"
            fill="none"
            stroke="var(--tab-home)"
            strokeWidth={2.5}
            strokeLinecap="round"
          />
          {[236, 240, 244].map((x, i) => (
            <path
              key={x}
              className="scene-steam"
              d={`M${x} 46 q-3 -5 0 -9 q3 -4 0 -8`}
              fill="none"
              stroke="var(--muted-foreground)"
              strokeWidth={1.4}
              strokeLinecap="round"
              style={{ animationDelay: `${i * 0.9}s` }}
            />
          ))}
        </g>

        {/* Lamp light, behind everything that stands in front of it */}
        <circle
          className="scene-lamp-glow"
          cx={30}
          cy={104}
          r={54}
          fill={`url(#${glow})`}
          style={{ opacity: lampOn ? 0.9 : 0 }}
        />

        {/* Floating dust in the light */}
        {[
          [52, 120, 0],
          [96, 108, 2.4],
          [150, 100, 4.1],
          [196, 118, 1.3],
          [118, 126, 5.6],
          [226, 104, 3.2]
        ].map(([x, y, d]) => (
          <circle
            key={`${x}-${y}`}
            className="scene-mote"
            cx={x}
            cy={y}
            r={1.6}
            fill="var(--primary)"
            style={{ animationDelay: `${d}s` }}
          />
        ))}

        {/* Pip's shadow */}
        <ellipse cx={140} cy={FLOOR_Y + 3} rx={26} ry={4} fill="var(--foreground)" opacity={0.12} />
      </svg>

      {/* The lamp, a real switch */}
      <button
        type="button"
        aria-pressed={lampOn}
        aria-label={t('house.home.scene.lamp')}
        onClick={() => setLamp((v) => !v)}
        className="cursor-pointer rounded-md outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
        style={{ position: 'absolute', bottom: '19%', left: '4%', height: '36%', width: '10%' }}
      >
        <svg
          viewBox="0 0 28 64"
          aria-hidden="true"
          style={{ width: '100%', height: '100%', display: 'block' }}
        >
          <path
            d="M14 18 V62"
            stroke="var(--border-strong)"
            strokeWidth={3}
            strokeLinecap="round"
          />
          <path d="M6 62 H22" stroke="var(--border-strong)" strokeWidth={3} strokeLinecap="round" />
          <path
            d="M3 20 L8 2 H20 L25 20 Z"
            fill="var(--tab-connections)"
            stroke="var(--tab-connections-ink)"
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
          <ellipse
            cx={14}
            cy={20}
            rx={9}
            ry={2.5}
            fill="#ffffff"
            style={{ opacity: lampOn ? 0.95 : 0.25, transition: 'opacity 400ms' }}
          />
        </svg>
      </button>

      {/* The plant, tap to make it rustle */}
      <button
        type="button"
        aria-label={t('house.home.scene.plant')}
        onClick={() => setWiggle((n) => n + 1)}
        className="cursor-pointer rounded-md outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
        style={{ position: 'absolute', right: '3%', bottom: '18%', height: '34%', width: '12%' }}
      >
        <svg
          viewBox="0 0 34 60"
          aria-hidden="true"
          style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible' }}
        >
          <g key={wiggle} className={wiggle > 0 ? 'scene-leaf scene-rustle' : 'scene-leaf'}>
            <path
              d="M17 38 q-14 -4 -13 -22 q12 2 13 22z"
              fill="var(--tab-achievements-ink)"
              opacity={0.85}
            />
            <path d="M17 38 q14 -6 13 -26 q-13 4 -13 26z" fill="var(--tab-achievements-ink)" />
            <path d="M17 38 q-3 -10 2 -22 q6 12 -2 22z" fill="var(--tab-summary-ink)" />
          </g>
          <path d="M5 38 H29 L26 58 H8 Z" fill="var(--tab-settings)" />
        </svg>
      </button>

      {/* Pip himself: leans toward the pointer, hops when poked */}
      <div
        ref={leanRef}
        className="scene-lean"
        style={{
          position: 'absolute',
          left: '50%',
          top: `${(FLOOR_Y / 176) * 100}%`,
          marginTop: `${-FEET / 16}rem`,
          marginLeft: `${-PIP_SIZE / 32}rem`
        }}
      >
        <button
          type="button"
          onClick={poke}
          aria-label={t('house.home.scene.poke')}
          disabled={paused}
          className="relative block cursor-pointer rounded-2xl outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-default"
        >
          <Pip mood={mood} size={PIP_SIZE} />
          {sparks.map((s) => (
            <svg
              key={s.id}
              aria-hidden="true"
              viewBox="0 0 10 10"
              className="scene-spark"
              style={
                {
                  position: 'absolute',
                  top: 0,
                  left: '50%',
                  width: '0.75rem',
                  pointerEvents: 'none',
                  '--dx': `${s.dx}px`
                } as React.CSSProperties
              }
            >
              <path d="M5 0 Q5 5 10 5 Q5 5 5 10 Q5 5 0 5 Q5 5 5 0Z" fill="var(--primary)" />
            </svg>
          ))}
        </button>
      </div>
    </div>
  )
}

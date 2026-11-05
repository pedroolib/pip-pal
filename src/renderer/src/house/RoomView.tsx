import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft } from 'lucide-react'
import { api } from '@renderer/api'
import { Button } from '@renderer/components/ui/button'
import { Pip } from '@renderer/pip/Pip'
import { hashFor } from './route'
import { useLoad } from './useLoad'

function partOfDay(d: Date): 'morning' | 'afternoon' | 'evening' {
  const h = d.getHours()
  return h < 12 ? 'morning' : h < 19 ? 'afternoon' : 'evening'
}

// A few motes drifting in the window's light: x, y, delay (s).
const MOTES: [number, number, number][] = [
  [262, 214, 0],
  [296, 246, 1.6],
  [330, 232, 3.1],
  [352, 276, 4.4],
  [284, 270, 2.2]
]

/**
 * Pip's room, drawn once. Colors, the sun and moon, and the lamp's light all come from main.css
 * (`.room-scene`), so light and dark need no redraw: the sun sets, the moon and stars rise, the lamp comes on.
 */
function Scene(): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div
      role="img"
      aria-label={t('house.room.sceneLight')}
      className="room-scene absolute inset-0 overflow-hidden"
    >
      <svg
        viewBox="0 0 800 420"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 size-full"
      >
        <defs>
          <radialGradient id="room-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--rs-light)" stopOpacity="0.9" />
            <stop offset="55%" stopColor="var(--rs-light)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--rs-light)" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="room-cone" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--rs-light)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="var(--rs-light)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="room-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" className="rs-sky-top" />
            <stop offset="100%" className="rs-sky-low" />
          </linearGradient>
          <linearGradient id="room-beam" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="room-wall-shade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#000000" stopOpacity="0.07" />
            <stop offset="35%" stopColor="#000000" stopOpacity="0" />
          </linearGradient>
          {/* Everything seen through the window stays inside the glass. */}
          <clipPath id="room-glass">
            <circle cx="220" cy="128" r="63" />
          </clipPath>
        </defs>

        {/* Walls, a rail with panelling below it, floor boards and a skirting board. */}
        <rect x="-400" y="-400" width="1600" height="1200" className="rs-wall" />
        <rect x="-400" y="-400" width="1600" height="800" fill="url(#room-wall-shade)" />
        <rect x="-400" y="206" width="1600" height="90" className="rs-wainscot" />
        <rect x="-400" y="202" width="1600" height="6" rx="3" className="rs-rail" />
        <g className="rs-panel-lines">
          {[40, 150, 260, 370, 480, 590, 700, 810].map((x) => (
            <rect key={x} x={x} y="222" width="90" height="60" rx="6" />
          ))}
        </g>
        <rect x="-400" y="292" width="1600" height="600" className="rs-floor" />
        <g className="rs-plank">
          <path d="M-400 322 H1200 M-400 352 H1200 M-400 386 H1200 M-400 424 H1200" />
          <path d="M120 292 V322 M340 322 V352 M560 322 V352 M240 352 V386 M470 352 V386 M690 352 V386 M90 386 V424 M360 386 V424 M620 386 V424 M850 386 V424" />
        </g>
        <rect x="-400" y="284" width="1600" height="11" className="rs-skirting" />

        {/* Light from the window across the room: only by day. */}
        <g className="rs-beam">
          <path d="M180 150 L256 150 L464 400 L300 400 Z" fill="url(#room-beam)" />
          <g className="rs-motes">
            {MOTES.map(([x, y, delay]) => (
              <circle key={x} cx={x} cy={y} r="2" style={{ animationDelay: `${delay}s` }} />
            ))}
          </g>
        </g>

        {/* The window: sun and clouds by day, moon and stars at night, hills and trees, a cross, curtains. */}
        <g>
          <circle cx="220" cy="128" r="74" className="rs-frame" />
          <circle cx="220" cy="128" r="66" className="rs-frame-inner" />
          <g clipPath="url(#room-glass)">
            <rect x="140" y="50" width="160" height="160" fill="url(#room-sky)" />
            <g className="rs-stars">
              <circle cx="176" cy="92" r="1.8" />
              <circle cx="206" cy="76" r="2.2" />
              <circle cx="244" cy="86" r="1.6" />
              <circle cx="270" cy="112" r="2" />
              <circle cx="186" cy="116" r="1.4" />
              <circle cx="256" cy="66" r="1.4" />
            </g>
            <g className="rs-sun">
              <circle cx="262" cy="92" r="22" className="rs-sun-glow" />
              <circle cx="262" cy="92" r="12" className="rs-sun-core" />
            </g>
            <g className="rs-moon">
              <circle cx="190" cy="94" r="12" className="rs-moon-core" />
              <circle cx="196" cy="90" r="10" className="rs-moon-cut" />
            </g>
            <g className="rs-clouds">
              <g className="rs-cloud-a">
                <ellipse cx="190" cy="98" rx="20" ry="6.5" />
                <ellipse cx="204" cy="92" rx="12" ry="7" />
              </g>
              <g className="rs-cloud-b">
                <ellipse cx="258" cy="122" rx="15" ry="5" />
                <ellipse cx="268" cy="117" rx="9" ry="5.5" />
              </g>
            </g>
            <path
              d="M130 158 Q168 122 206 150 Q240 118 310 156 V210 H130 Z"
              className="rs-hill-far"
            />
            <path d="M130 176 Q176 148 224 172 Q262 150 310 178 V210 H130 Z" className="rs-hill" />
            <g className="rs-tree">
              <path d="M178 184 V164 M178 170 Q168 160 174 150 Q186 158 178 170 Z" />
              <path d="M252 186 V162 M252 168 Q240 156 247 144 Q262 154 252 168 Z" />
            </g>
          </g>
          <path d="M220 62 V194 M154 128 H286" className="rs-cross" />
          <circle cx="220" cy="128" r="66" className="rs-glass-sheen" />
          <rect x="172" y="204" width="96" height="9" rx="4.5" className="rs-frame" />
          {/* A little pot on the sill. */}
          <path d="M236 204 L239 190 H253 L256 204 Z" className="rs-pot" />
          <path
            d="M246 190 Q238 178 240 168 Q252 174 246 190 Z M246 190 Q256 180 260 170 Q248 174 246 190 Z"
            className="rs-leaf"
          />
        </g>
        {/* Curtains and rod. */}
        <g>
          <path d="M112 44 H328" className="rs-rod" />
          <circle cx="110" cy="44" r="5" className="rs-rod-end" />
          <circle cx="330" cy="44" r="5" className="rs-rod-end" />
          <path
            d="M122 48 H162 Q168 110 156 150 Q150 180 160 214 H118 Q128 150 122 48 Z"
            className="rs-curtain"
          />
          <path d="M142 50 Q148 120 140 214" className="rs-curtain-fold" />
          <path
            d="M318 48 H278 Q272 110 284 150 Q290 180 280 214 H322 Q312 150 318 48 Z"
            className="rs-curtain"
          />
          <path d="M298 50 Q292 120 300 214" className="rs-curtain-fold" />
        </g>

        {/* Pictures on the wall. */}
        <g>
          <rect x="344" y="66" width="62" height="48" rx="4" className="rs-picture-frame" />
          <rect x="350" y="72" width="50" height="36" rx="2" className="rs-picture" />
          <path d="M350 108 L366 90 L378 102 L388 88 L400 108 Z" className="rs-picture-hill" />
          <circle cx="388" cy="82" r="5" className="rs-picture-sun" />
          <circle cx="424" cy="84" r="14" className="rs-picture-frame" />
          <circle cx="424" cy="84" r="10" className="rs-picture" />
          <path d="M418 88 Q424 76 430 88" className="rs-picture-line" />
        </g>

        {/* A shelf with books, a small frame and a plant. */}
        <g>
          <rect x="468" y="112" width="14" height="46" rx="2" className="rs-book-a" />
          <rect x="486" y="124" width="12" height="34" rx="2" className="rs-book-b" />
          <rect x="502" y="116" width="14" height="42" rx="2" className="rs-book-c" />
          <rect x="520" y="132" width="20" height="26" rx="2" className="rs-picture-frame" />
          <rect x="524" y="136" width="12" height="18" rx="1" className="rs-picture" />
          <path d="M556 130 L566 158 H590 L600 130 Z" className="rs-pot" />
          <path
            d="M578 130 Q562 108 558 92 Q580 98 578 130 Z M578 130 Q594 106 604 94 Q582 98 578 130 Z"
            className="rs-leaf"
          />
          <rect x="454" y="158" width="160" height="10" rx="5" className="rs-shelf" />
          <path d="M470 168 V182 M598 168 V182" className="rs-bracket" />
        </g>

        {/* The door, a light switch and a mat. */}
        <a href={hashFor('home')} aria-label={t('house.room.door')} className="rs-door-link">
          <path d="M690 290 V170 Q690 126 726 126 Q762 126 762 170 V290 Z" className="rs-door" />
          <path d="M702 290 V172 Q702 140 726 140 Q750 140 750 172 V290" className="rs-door-line" />
          <circle cx="748" cy="226" r="5" className="rs-knob" />
        </a>
        <rect x="660" y="214" width="12" height="18" rx="3" className="rs-switch" />
        <rect x="664" y="219" width="4" height="7" rx="1" className="rs-switch-toggle" />
        <rect x="684" y="298" width="84" height="12" rx="6" className="rs-mat" />

        {/* A plant on the floor. */}
        <g>
          <ellipse cx="122" cy="398" rx="36" ry="6" className="rs-shadow" />
          <path d="M92 396 L98 340 H146 L152 396 Z" className="rs-pot" />
          <path d="M122 340 Q96 312 98 270 Q130 290 122 340 Z" className="rs-leaf" />
          <path d="M122 340 Q150 306 162 276 Q128 288 122 340 Z" className="rs-leaf-b" />
          <path d="M122 340 Q118 300 124 258" className="rs-stem" />
        </g>

        {/* The rug, and a cushion beside it. */}
        <ellipse cx="400" cy="352" rx="150" ry="26" className="rs-rug-edge" />
        <ellipse cx="400" cy="352" rx="124" ry="19" className="rs-rug" />
        <ellipse cx="400" cy="352" rx="78" ry="11" className="rs-rug-edge-in" />
        <g>
          <ellipse cx="270" cy="378" rx="34" ry="6" className="rs-shadow" />
          <path
            d="M240 372 Q238 346 270 344 Q302 346 300 372 Q270 382 240 372 Z"
            className="rs-cushion"
          />
          <path d="M250 358 Q270 366 290 358" className="rs-cushion-line" />
        </g>

        {/* The lamp: its light is off by day and on at night. */}
        <g>
          <ellipse cx="620" cy="374" rx="30" ry="6" className="rs-shadow" />
          <g className="rs-glow">
            <g className="rs-glow-breath">
              <circle cx="620" cy="214" r="150" fill="url(#room-glow)" />
              <path d="M590 228 L534 372 H706 L650 228 Z" fill="url(#room-cone)" />
            </g>
          </g>
          <rect x="617" y="238" width="6" height="128" rx="3" className="rs-lamp-pole" />
          <rect x="598" y="364" width="44" height="9" rx="4.5" className="rs-lamp-pole" />
          <path d="M594 232 L606 184 H634 L646 232 Z" className="rs-lamp-shade" />
          <ellipse cx="620" cy="232" rx="26" ry="6" className="rs-lamp-bulb" />
        </g>

        {/* Pip stands on the rug, awake; only the lamp and the sky follow the theme. */}
        <g transform="translate(320 196)">
          <Pip mood="calm" size={160} />
        </g>
      </svg>
    </div>
  )
}

/** Pip's room: it fills the House's content area. The door, the back arrow and Esc lead into the House. */
export function RoomView(): React.JSX.Element {
  const { t } = useTranslation()
  const name = useLoad(() => api.getProfile()).data?.name?.trim()
  const part = partOfDay(new Date())
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') location.hash = hashFor('home')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <main className="relative min-h-dvh flex-1 overflow-hidden">
      <Scene />
      <div className="pointer-events-none absolute inset-x-0 top-[5%] flex justify-center px-6">
        <h1 className="room-greeting rounded-full border bg-background/80 px-6 py-1.5 text-center text-[clamp(1.5rem,3.4vw,2.5rem)] leading-tight font-bold shadow-card backdrop-blur-md">
          {name ? t(`house.home.greeting.${part}Name`, { name }) : t(`house.home.greeting.${part}`)}
        </h1>
      </div>
      <Button
        asChild
        variant="ghost"
        size="icon"
        className="absolute top-4 left-4 bg-surface/70 backdrop-blur"
      >
        <a href={hashFor('home')} aria-label={t('house.room.back')}>
          <ArrowLeft aria-hidden />
        </a>
      </Button>
    </main>
  )
}

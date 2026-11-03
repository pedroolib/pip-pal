import { Pip } from '@renderer/pip/Pip'

// Pip's room: flat inline SVG in Harbor tints (colors are the --room-* variables). Replace the
// shapes in Back, Front and the floor arc to redraw it; Pip and the layout stay as they are.
// Everything here is decoration (aria-hidden); Pip keeps his own label.

/** Wall furniture, drawn first so the floor hides the foot of the door. 880 wide, never scaled. */
function Back(): React.JSX.Element {
  return (
    <svg
      aria-hidden
      viewBox="0 0 880 380"
      className="absolute bottom-0 left-1/2 -ml-[440px] h-[380px] w-[880px] overflow-visible"
    >
      <g transform="translate(0 60)">
        <circle cx="296" cy="96" r="66" fill="var(--surface)" />
        <clipPath id="room-glass">
          <circle cx="296" cy="96" r="57" />
        </clipPath>
        <circle cx="296" cy="96" r="57" fill="var(--room-glass)" />
        <path
          clipPath="url(#room-glass)"
          d="M230 120 Q266 92 296 114 Q326 90 362 118 V170 H230Z"
          fill="var(--room-leaf)"
          opacity=".55"
        />
        <ellipse cx="272" cy="72" rx="20" ry="7" fill="var(--surface)" opacity=".8" />
        <ellipse cx="326" cy="84" rx="14" ry="5" fill="var(--surface)" opacity=".7" />
        <path d="M296 39 V153 M239 96 H353" stroke="var(--surface)" strokeWidth="6" />
        <rect x="256" y="160" width="80" height="10" rx="5" fill="var(--surface)" />

        <g transform="translate(14 -26)">
          <rect x="516" y="118" width="124" height="9" rx="4.5" fill="var(--body)" />
          <rect x="528" y="82" width="16" height="36" rx="3" fill="var(--primary)" />
          <rect x="546" y="90" width="14" height="28" rx="3" fill="var(--room-leaf-dark)" />
          <rect
            x="562"
            y="78"
            width="18"
            height="40"
            rx="3"
            fill="var(--background)"
            stroke="var(--border)"
            strokeWidth="2"
          />
          <path d="M614 118 l-6 -24 h36 l-6 24z" fill="var(--primary)" />
          <path
            d="M626 94 q-18 -18 -8 -34 q16 8 8 34 M626 94 q4 -26 24 -30 q4 18 -24 30 M626 94 q-22 -4 -24 -22 q18 -2 24 22"
            fill="var(--room-leaf)"
          />
        </g>

        <path d="M762 330 V118 A44 44 0 0 1 850 118 V330Z" fill="var(--room-leaf)" />
        <path
          d="M776 330 V122 A30 30 0 0 1 836 122 V330Z"
          fill="none"
          stroke="var(--room-leaf-dark)"
          strokeWidth="3"
          opacity=".7"
        />
        <circle cx="832" cy="180" r="5" fill="var(--background)" />
      </g>
    </svg>
  )
}

/** One gentle arc across the full width (same curve everywhere), a little lower at both edges. */
function Floor(): React.JSX.Element {
  return (
    <svg
      aria-hidden
      viewBox="0 0 100 30"
      preserveAspectRatio="none"
      className="absolute inset-x-0 bottom-0 h-[7.5rem] w-full"
    >
      <path d="M0 10 Q50 -2 100 10 V30 H0Z" fill="var(--room-floor)" />
      <path
        d="M0 10 Q50 -2 100 10"
        fill="none"
        stroke="var(--border)"
        strokeWidth="4"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

/** Things standing on the floor: the plant and the rug Pip stands on. */
function Front(): React.JSX.Element {
  return (
    <svg
      aria-hidden
      viewBox="0 0 880 120"
      className="absolute bottom-0 left-1/2 -ml-[440px] h-[120px] w-[880px] overflow-visible"
    >
      <g transform="translate(0 -142)">
        <path d="M104 252 l-10 -42 h52 l-10 42z" fill="var(--primary)" />
        <path
          d="M120 210 q-30 -30 -14 -62 q30 16 14 62 M120 210 q8 -46 42 -56 q8 34 -42 56 M120 210 q-40 -6 -48 -38 q32 -4 48 38"
          fill="var(--room-leaf)"
        />
        <path
          d="M120 210 q-6 -30 -14 -62"
          fill="none"
          stroke="var(--room-leaf-dark)"
          strokeWidth="2"
        />
      </g>
      <ellipse cx="440" cy="80" rx="170" ry="24" fill="var(--background)" />
      <ellipse
        cx="440"
        cy="80"
        rx="170"
        ry="24"
        fill="none"
        stroke="var(--secondary)"
        strokeWidth="8"
      />
      <ellipse
        cx="440"
        cy="80"
        rx="120"
        ry="15"
        fill="none"
        stroke="var(--border)"
        strokeWidth="2"
      />
      <ellipse cx="440" cy="78" rx="78" ry="10" fill="var(--foreground)" opacity=".16" />
    </svg>
  )
}

/** The wall edge to edge; the floor colour continues below it. Pip (the real one) stands on the rug. */
export function Room(): React.JSX.Element {
  return (
    <div className="relative h-[clamp(16rem,50dvh,23.75rem)] flex-none overflow-hidden bg-room-wall">
      <Back />
      <Floor />
      <Front />
      <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2">
        <Pip mood="calm" size={192} />
      </div>
    </div>
  )
}

import type { WeatherIconKind } from "@/lib/weatherScene/icon";

export type { WeatherIconKind };

const CLOUD_PATH = "M6 17a4 4 0 0 1 .3-8 5.5 5.5 0 0 1 10.6-1.6A4.5 4.5 0 0 1 18 17H6z";

function Sun() {
  return (
    <>
      <circle cx="12" cy="12" r="4.5" fill="currentColor" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
        <line
          key={deg}
          x1="12"
          y1="3.5"
          x2="12"
          y2="5.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          transform={`rotate(${deg} 12 12)`}
        />
      ))}
    </>
  );
}

function Moon() {
  return <path d="M15.5 4.5a8 8 0 1 0 5 12.8A9 9 0 0 1 15.5 4.5z" fill="currentColor" />;
}

function Cloud({ small = false }: { small?: boolean }) {
  return <path d={CLOUD_PATH} fill="currentColor" transform={small ? "translate(0 2) scale(0.82)" : undefined} />;
}

function RainDrops() {
  return (
    <>
      <line x1="8" y1="19" x2="7" y2="22" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="12" y1="19" x2="11" y2="22" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="16" y1="19" x2="15" y2="22" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </>
  );
}

function SnowDots() {
  return (
    <>
      <circle cx="8" cy="20" r="1.1" fill="currentColor" />
      <circle cx="12" cy="21.5" r="1.1" fill="currentColor" />
      <circle cx="16" cy="20" r="1.1" fill="currentColor" />
    </>
  );
}

function Bolt() {
  return <path d="M13 15.5h-3.2l1.9-4.6H9.3L11.8 5l.7 4.3h2.3L13 15.5z" fill="currentColor" />;
}

function FogLines() {
  return (
    <>
      <line x1="4" y1="9" x2="20" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.9" />
      <line x1="6" y1="13" x2="18" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
      <line x1="4" y1="17" x2="20" y2="17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.9" />
    </>
  );
}

/**
 * Small, original, single-color line/shape iconography — deliberately
 * not a copy of any platform's weather glyph set. `currentColor` so it
 * inherits whatever text color its container already uses.
 */
export function WeatherIcon({ kind, className }: { kind: WeatherIconKind; className?: string }) {
  const props = { viewBox: "0 0 24 24", className: className ?? "h-5 w-5", "aria-hidden": true as const };

  switch (kind) {
    case "sun":
      return (
        <svg {...props}>
          <Sun />
        </svg>
      );
    case "moon":
      return (
        <svg {...props}>
          <Moon />
        </svg>
      );
    case "sun-cloud":
      return (
        <svg {...props}>
          <g transform="translate(-2 -2) scale(0.85)">
            <Sun />
          </g>
          <Cloud />
        </svg>
      );
    case "moon-cloud":
      return (
        <svg {...props}>
          <g transform="translate(4 -3) scale(0.6)">
            <Moon />
          </g>
          <Cloud />
        </svg>
      );
    case "cloud":
      return (
        <svg {...props}>
          <Cloud />
        </svg>
      );
    case "fog":
      return (
        <svg {...props}>
          <FogLines />
        </svg>
      );
    case "rain-cloud":
      return (
        <svg {...props}>
          <Cloud small />
          <RainDrops />
        </svg>
      );
    case "snow":
      return (
        <svg {...props}>
          <Cloud small />
          <SnowDots />
        </svg>
      );
    case "storm":
      return (
        <svg {...props}>
          <Cloud small />
          <Bolt />
        </svg>
      );
    case "storm-rain":
      return (
        <svg {...props}>
          <Cloud small />
          <Bolt />
          <line x1="17" y1="18" x2="16" y2="21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
  }
}

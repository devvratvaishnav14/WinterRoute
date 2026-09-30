interface IconProps {
  className?: string;
}

const commonProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function WalkIcon({ className }: IconProps) {
  return (
    <svg {...commonProps} className={className} aria-hidden="true">
      <circle cx="13" cy="4.5" r="1.6" />
      <path d="M11 8l-2.5 3 1.8 1.8-1 5.7M11 8l3 1.5 2.5 2M14 9.5l-1.5 4 3 4.5" />
    </svg>
  );
}

export function CarIcon({ className }: IconProps) {
  return (
    <svg {...commonProps} className={className} aria-hidden="true">
      <path d="M4 16v-3.2a2 2 0 0 1 .4-1.2l1.8-2.4a2 2 0 0 1 1.6-.8h8.4a2 2 0 0 1 1.6.8l1.8 2.4a2 2 0 0 1 .4 1.2V16" />
      <path d="M4 16h16M4 16a1.2 1.2 0 0 0 1.2 1.2h.6A1.2 1.2 0 0 0 7 16M17 16a1.2 1.2 0 0 0 1.2 1.2h.6A1.2 1.2 0 0 0 20 16" />
      <path d="M6 12h12" />
    </svg>
  );
}

export function BusIcon({ className }: IconProps) {
  return (
    <svg {...commonProps} className={className} aria-hidden="true">
      <rect x="4.5" y="4" width="15" height="13" rx="2" />
      <path d="M4.5 10.5h15M8 13.5h.01M16 13.5h.01" />
      <path d="M7 17v1.6M17 17v1.6" />
    </svg>
  );
}

export function TrainIcon({ className }: IconProps) {
  return (
    <svg {...commonProps} className={className} aria-hidden="true">
      <rect x="6" y="3.5" width="12" height="13" rx="3" />
      <path d="M6 10.5h12M9 7h6" />
      <circle cx="9.3" cy="13.3" r="0.9" />
      <circle cx="14.7" cy="13.3" r="0.9" />
      <path d="M8.5 19l-1.5 2M15.5 19l1.5 2" />
    </svg>
  );
}

export function CycleIcon({ className }: IconProps) {
  return (
    <svg {...commonProps} className={className} aria-hidden="true">
      <circle cx="6" cy="16.5" r="3" />
      <circle cx="18" cy="16.5" r="3" />
      <path d="M6 16.5l4-8h4l3.5 8M10 8.5h3M13 8.5l2 4h3" />
    </svg>
  );
}

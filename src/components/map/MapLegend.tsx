import type { LegendEntry } from "./routeMapGeometry";

/** Only rendered when the route mixes multiple visually-distinct modes — see `legendEntriesFor`. */
export function MapLegend({ entries }: { entries: LegendEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <div className="absolute bottom-2 left-2 flex flex-wrap gap-x-3 gap-y-1 rounded-lg bg-[#0b1220]/80 px-2.5 py-1.5 text-[11px] text-white/70 backdrop-blur-sm">
      {entries.map((entry) => (
        <span key={entry.mode} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-1 w-5 rounded-full"
            style={{
              backgroundColor: entry.style.routeColor,
              opacity: entry.style.routeOpacity,
              backgroundImage: entry.style.dashed ? `repeating-linear-gradient(90deg, ${entry.style.routeColor} 0 4px, transparent 4px 7px)` : undefined,
            }}
          />
          {entry.label}
        </span>
      ))}
    </div>
  );
}

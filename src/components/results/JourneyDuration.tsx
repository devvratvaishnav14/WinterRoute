import { formatAdditionalTime, formatDurationMinutes, formatDurationRange } from "@/lib/duration/format";
import type { DurationPreviewState } from "@/components/trip/DurationPreview";

/** The expected-journey range, typical duration, and added-time comparison — purely presentational. */
export function JourneyDuration({ state }: { state: DurationPreviewState | null }) {
  if (!state) return null;
  const { duration } = state;

  if (duration.predictionStatus === "insufficient-data") {
    return (
      <div>
        <p className="text-xs font-medium tracking-[0.2em] text-white/55 uppercase">Expected journey</p>
        <p className="mt-1 text-white/60">Unavailable</p>
      </div>
    );
  }

  const additional = formatAdditionalTime(duration.baselineDurationMinutes, duration.lowerBoundMinutes, duration.upperBoundMinutes);
  const noAddedTime = additional === "no added time expected";

  return (
    <div>
      <p className="text-xs font-medium tracking-[0.2em] text-white/55 uppercase">Expected journey</p>
      <p className="mt-1 text-2xl font-semibold text-white">{formatDurationRange(duration.lowerBoundMinutes, duration.upperBoundMinutes)}</p>
      {noAddedTime ? (
        <p className="mt-1 text-sm text-white/60">No additional delay currently expected</p>
      ) : (
        <p className="mt-1 text-sm text-white/60">
          Typical {formatDurationMinutes(duration.baselineDurationMinutes)}
          {" · "}Additional {additional}
        </p>
      )}
      {duration.predictionStatus === "route-disrupted" ? (
        <p className="mt-2 text-xs text-rose-200/80">This range doesn&apos;t account for the itinerary disruption above.</p>
      ) : null}
    </div>
  );
}

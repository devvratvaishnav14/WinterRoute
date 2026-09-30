import type { ReactNode } from "react";
import { formatMinuteDifferenceRange } from "@/lib/duration/format";
import { vancouverCalendarDate } from "@/lib/time/vancouverTime";
import { formatTimeRange, formatTripTime } from "@/lib/trip/format";
import type { TimingPreviewState } from "@/components/trip/TimingPreview";

/** Appends "(previous day)"/"(next day)" when a time's Vancouver calendar date differs from a reference date — e.g. a Leave-By time before midnight for an early-morning arrival target. */
function formatDayAwareTime(date: Date, referenceDate: Date): string {
  const time = formatTripTime(date);
  if (vancouverCalendarDate(date) === vancouverCalendarDate(referenceDate)) return time;
  return date.getTime() < referenceDate.getTime() ? `${time} (previous day)` : `${time} (next day)`;
}

/** Same collapsing trick as `formatTimeRange` (compare the formatted output, not the raw Dates), but day-aware for ranges that may cross midnight relative to `referenceDate`. */
function formatDayAwareTimeRange(lower: Date, upper: Date, referenceDate: Date): string {
  const lowerLabel = formatDayAwareTime(lower, referenceDate);
  const upperLabel = formatDayAwareTime(upper, referenceDate);
  return lowerLabel === upperLabel ? lowerLabel : `${lowerLabel}–${upperLabel}`;
}

function StatusNotice({ tone, title, children }: { tone: "rose" | "amber"; title: string; children?: ReactNode }) {
  const toneClasses =
    tone === "rose" ? "border-rose-400/25 bg-rose-400/10 text-rose-100" : "border-amber-300/25 bg-amber-300/10 text-amber-100";
  return (
    <div className={`rounded-2xl border p-4 ${toneClasses}`}>
      <p className="text-lg font-semibold">{title}</p>
      {children ? <div className="mt-2 text-sm text-white/80">{children}</div> : null}
    </div>
  );
}

/**
 * The primary hero result — the single answer a user should understand
 * within a few seconds. Purely presentational: renders an already-computed
 * `CommuteTimingRecommendationV0`, never calculates anything itself.
 */
export function TimingHero({ state }: { state: TimingPreviewState | null }) {
  if (!state) return null;
  const { timing } = state;

  if (timing.status === "insufficient-data") {
    return (
      <StatusNotice tone="amber" title="Expected commute unavailable">
        <p>There isn&apos;t enough information to recommend a departure time for this trip right now.</p>
        {timing.statusReasons.length > 0 ? (
          <ul className="mt-2 list-inside list-disc">
            {timing.statusReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : null}
      </StatusNotice>
    );
  }

  if (timing.status === "route-disrupted") {
    return (
      <StatusNotice tone="rose" title="Current itinerary disrupted">
        <p>A reliable departure recommendation isn&apos;t available for this trip right now.</p>
        {timing.statusReasons.length > 0 ? (
          <ul className="mt-2 list-inside list-disc">
            {timing.statusReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : null}
      </StatusNotice>
    );
  }

  if (timing.status === "departure-window-missed" && timing.arriveBy) {
    const { arriveBy } = timing;
    return (
      <StatusNotice tone="amber" title="Recommended departure window has passed">
        {arriveBy.leaveNowExpectedArrivalRange ? (
          <p>
            If you leave now, expected arrival is approximately{" "}
            <span className="font-medium text-white">
              {formatTimeRange(arriveBy.leaveNowExpectedArrivalRange.lower, arriveBy.leaveNowExpectedArrivalRange.upper)}
            </span>
            .
          </p>
        ) : (
          <p>This analysis is no longer recent enough to estimate a &ldquo;leave now&rdquo; arrival — recheck using Leave At: Now.</p>
        )}
      </StatusNotice>
    );
  }

  const limitedDataNote =
    timing.status === "limited-data" ? (
      <p className="mt-3 text-xs text-amber-200/70">Based on limited data — {timing.statusReasons.join(" ")}</p>
    ) : null;

  if (timing.preference === "arriveBy" && timing.arriveBy?.recommendedDepartureTime) {
    const { arriveBy } = timing;
    return (
      <div>
        <p className="text-xs font-medium tracking-[0.2em] text-white/55 uppercase">Leave by</p>
        <p className="text-4xl font-semibold text-white sm:text-5xl">
          {formatDayAwareTime(arriveBy.recommendedDepartureTime!, arriveBy.targetArrivalTime)}
        </p>
        <p className="mt-2 text-sm text-white/60">
          Arrive by {formatTripTime(arriveBy.targetArrivalTime)}
          {arriveBy.leaveEarlierByMinutes !== undefined ? (
            <>
              {" · "}
              {arriveBy.leaveEarlierByMinutes > 0 ? (
                <span className="text-white/80">~{arriveBy.leaveEarlierByMinutes} min earlier than typical</span>
              ) : (
                <span className="text-white/80">same as typical departure</span>
              )}
            </>
          ) : null}
        </p>
        {limitedDataNote}
      </div>
    );
  }

  if (timing.preference === "leaveAt" && timing.leaveAt?.expectedArrivalLower && timing.leaveAt.expectedArrivalUpper) {
    const { leaveAt } = timing;
    const lower = leaveAt.expectedArrivalLower!;
    const upper = leaveAt.expectedArrivalUpper!;
    const arrivalCollapsed = formatDayAwareTimeRange(lower, upper, leaveAt.selectedDepartureTime);

    const diff = leaveAt.arrivalDifferenceFromTypicalMinutes;
    const matchesTypical = diff !== undefined && diff.lower === 0 && diff.upper === 0;

    return (
      <div>
        <p className="text-xs font-medium tracking-[0.2em] text-white/55 uppercase">Leave at</p>
        <p className="text-lg font-medium text-white/80">{formatTripTime(leaveAt.selectedDepartureTime)}</p>
        <p className="mt-3 text-xs font-medium tracking-[0.2em] text-white/55 uppercase">Expected arrival</p>
        <p className="text-4xl font-semibold text-white sm:text-5xl">{arrivalCollapsed}</p>
        {matchesTypical ? (
          <p className="mt-2 text-sm text-white/60">No additional delay currently expected</p>
        ) : leaveAt.typicalArrivalTime ? (
          <p className="mt-2 text-sm text-white/60">
            Typical arrival {formatTripTime(leaveAt.typicalArrivalTime)}
            {diff ? <>{" · "}Expected additional time {formatMinuteDifferenceRange(diff.lower, diff.upper)}</> : null}
          </p>
        ) : null}
        {limitedDataNote}
      </div>
    );
  }

  return null;
}

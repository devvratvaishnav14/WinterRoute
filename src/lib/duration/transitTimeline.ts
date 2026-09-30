import type { Route, RouteSegment } from "@/lib/route/types";
import { formatTripTime } from "@/lib/trip/format";
import type { TransitAnalysis, TransitSegmentAnalysis } from "@/lib/transit/types";
import { durationModelV0Config } from "./config";
import type { DelayContribution } from "./types";

export interface TransitTimelineResult {
  /** Sum of directly-observed realtime delay affecting the trip's final arrival, in minutes. */
  observedDelayMinutes: number;
  /** True when a missed connection or a cancellation was detected. */
  disrupted: boolean;
  disruptionReasons: string[];
  contributions: DelayContribution[];
}

function transitAnalysisFor(segment: RouteSegment, transit: TransitAnalysis | null): TransitSegmentAnalysis | undefined {
  if (!transit || transit.status !== "analyzed") return undefined;
  return transit.transitSegments.find((s) => s.routeSegmentId === segment.id);
}

function effectiveDeparture(ta: TransitSegmentAnalysis | undefined, fallback: Date | undefined): Date | undefined {
  return ta?.realtime?.realtimeDeparture ?? ta?.scheduledDeparture ?? fallback;
}

function effectiveArrival(ta: TransitSegmentAnalysis | undefined, fallback: Date | undefined): Date | undefined {
  return ta?.realtime?.realtimeArrival ?? ta?.scheduledArrival ?? fallback;
}

function lineLabel(segment: RouteSegment): string {
  return segment.transitLine?.shortName ? `${segment.mode === "rail" ? "Rail" : "Bus"} ${segment.transitLine.shortName}` : segment.mode === "rail" ? "the rail leg" : "the bus leg";
}

/**
 * Walks a route's actual transit segments in order and:
 *
 * 1. Detects a CANCELLATION on any matched leg.
 * 2. Detects a MISSED CONNECTION between two consecutive transit legs —
 *    only checked when the EARLIER leg has realtime evidence (a
 *    schedule-only itinerary is trusted as internally consistent, since
 *    Google/TransLink planned it as joinable; only new realtime evidence
 *    can show a planned connection has actually broken).
 * 3. Extracts the directly-observed net delay on the trip's FINAL
 *    transit leg, when realtime data exists for it — the representative
 *    figure for "how is this trip currently running," since an
 *    intermediate leg's delay that was fully absorbed by transfer buffer
 *    doesn't change the trip's actual end time.
 *
 * Deliberately does NOT attempt to look up a genuine alternate itinerary
 * from GTFS static schedule data when a connection is missed or a trip
 * is canceled — see docs/decisions/0010-duration-model-v0.md "Missed
 * connection handling": the project brief explicitly allows "if the next
 * departure cannot be determined reliably, increase uncertainty... rather
 * than inventing a connection," and building a live schedule re-query
 * would mean moving duration computation server-side and adding a new
 * GTFS-querying capability, out of scope for this V0 stage.
 */
export function analyzeTransitTimeline(route: Route, transit: TransitAnalysis | null): TransitTimelineResult {
  const contributions: DelayContribution[] = [];
  const disruptionReasons: string[] = [];
  let disrupted = false;

  const transitLegs = route.segments
    .map((segment, index) => ({ segment, index, ta: transitAnalysisFor(segment, transit) }))
    .filter((entry) => entry.segment.mode === "bus" || entry.segment.mode === "rail");

  for (const leg of transitLegs) {
    if (leg.ta?.realtime?.tripStatus === "canceled") {
      disrupted = true;
      disruptionReasons.push(`${lineLabel(leg.segment)} is currently reported canceled — the planned itinerary can't be completed as scheduled.`);
    }
  }

  for (let i = 0; i < transitLegs.length - 1; i++) {
    const current = transitLegs[i];
    const next = transitLegs[i + 1];
    if (!current.ta?.realtime) continue; // no realtime evidence for this leg -> nothing to contradict the planned schedule with

    const arrival = effectiveArrival(current.ta, current.segment.endTime);
    const departure = effectiveDeparture(next.ta, next.segment.startTime);
    if (!arrival || !departure) continue;

    let transferBufferMs = 0;
    for (let j = current.index + 1; j < next.index; j++) {
      transferBufferMs += (route.segments[j].durationMinutes ?? 0) * 60_000;
    }
    transferBufferMs = Math.max(transferBufferMs, durationModelV0Config.transit.transferBufferMinimumSeconds * 1000);

    if (arrival.getTime() + transferBufferMs > departure.getTime()) {
      disrupted = true;
      disruptionReasons.push(
        `${lineLabel(current.segment)}'s realtime arrival (${formatTripTime(arrival)}) leaves no time to make ${lineLabel(next.segment)}'s connection (scheduled ${formatTripTime(departure)}) — WinterRoute can't determine the next available connection from currently available data.`,
      );
    }
  }

  const lastLeg = transitLegs[transitLegs.length - 1];
  if (lastLeg?.ta?.realtime?.arrivalDelaySeconds !== undefined) {
    const minutes = lastLeg.ta.realtime.arrivalDelaySeconds / 60;
    contributions.push({
      key: "transitRealtimeDelay",
      label: "Transit realtime delay",
      centralMinutes: minutes,
      lowerMinutes: minutes,
      upperMinutes: minutes,
      provenance: "observed-provider",
      explanation: `${lineLabel(lastLeg.segment)} is currently reporting ${minutes >= 0 ? "a" : "an"} ${minutes >= 0 ? "+" : ""}${minutes.toFixed(0)} min arrival delay.`,
      appliesTo: lastLeg.segment.mode,
    });
  }

  const observedDelayMinutes = contributions.reduce((sum, c) => sum + c.centralMinutes, 0);

  return { observedDelayMinutes, disrupted, disruptionReasons, contributions };
}

/** Uncertainty widening for schedule-only legs (no realtime at all) and for alerts carrying no quantifiable delay — applied per matched transit leg, summed. */
export function buildTransitUncertaintyContributions(route: Route, transit: TransitAnalysis | null): DelayContribution[] {
  if (!transit || transit.status !== "analyzed") return [];

  const contributions: DelayContribution[] = [];
  const { scheduleOnlyUpperWideningMinutes, alertUpperWideningMinutes } = durationModelV0Config.transit;

  for (const segment of route.segments) {
    if (segment.mode !== "bus" && segment.mode !== "rail") continue;
    const ta = transitAnalysisFor(segment, transit);
    if (!ta || ta.status === "unmatched") continue;

    if (ta.status === "matched-schedule-only") {
      contributions.push({
        key: `transitScheduleOnly-${segment.id}`,
        label: "No realtime update yet",
        centralMinutes: 0,
        lowerMinutes: 0,
        upperMinutes: scheduleOnlyUpperWideningMinutes,
        provenance: "heuristic-v0",
        explanation: `${lineLabel(segment)} has no realtime update yet — the schedule is used as the best available estimate, with some allowance for the unconfirmed timing.`,
        appliesTo: segment.mode,
      });
    }

    if (ta.relevantAlerts.length > 0) {
      const hasMajorEffect = ta.relevantAlerts.some((a) => a.effect === "noService" || a.effect === "significantDelays" || a.effect === "detour");
      const widening = hasMajorEffect ? alertUpperWideningMinutes.major : alertUpperWideningMinutes.minor;
      contributions.push({
        key: `transitAlert-${segment.id}`,
        label: "Service alert",
        centralMinutes: 0,
        lowerMinutes: 0,
        upperMinutes: widening,
        provenance: "heuristic-v0",
        explanation: `A TransLink service alert affects ${lineLabel(segment)} without a quantified delay figure — the upper end of the estimate allows for it.`,
        appliesTo: segment.mode,
      });
    }
  }

  for (const alert of transit.systemAlerts) {
    const widening = alert.effect === "noService" || alert.effect === "significantDelays" ? alertUpperWideningMinutes.major : alertUpperWideningMinutes.minor;
    contributions.push({
      key: `transitSystemAlert-${alert.id}`,
      label: "System-wide alert",
      centralMinutes: 0,
      lowerMinutes: 0,
      upperMinutes: widening,
      provenance: "heuristic-v0",
      explanation: "A system-wide TransLink alert is active without a quantified delay figure — the upper end of the estimate allows for it.",
      appliesTo: "route",
    });
  }

  return contributions;
}

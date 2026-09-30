import { transitSegmentSeverity } from "@/lib/conditions/severity";
import { transitSegmentSummary } from "@/lib/conditions/buildRouteConditions";
import type { Route } from "@/lib/route/types";
import { formatTrafficDelay } from "@/lib/traffic/format";
import type { TrafficPreviewState } from "@/components/trip/TrafficPreview";
import type { TransitPreviewState } from "@/components/trip/TransitPreview";
import type { ItineraryStep } from "./types";

/**
 * Turns the ALREADY-COMPUTED `Route` (plus, for transit legs, the
 * matched `TransitSegmentAnalysis`) into a plain step-by-step itinerary
 * — no new routing/transit request. Uses ONLY fields the providers
 * actually supplied: a missing headsign, board/alight stop, never gets
 * invented, it's simply omitted from that step.
 */
export function buildItinerarySteps(
  route: Route,
  transitState: TransitPreviewState | null,
  trafficState: TrafficPreviewState | null,
): ItineraryStep[] {
  const transitSegments =
    transitState?.status === "success" && transitState.analysis.status === "analyzed" ? transitState.analysis.transitSegments : [];

  const trafficDelayMinutes =
    trafficState?.status === "success" && trafficState.result.trafficAnalysis.status === "analyzed"
      ? trafficState.result.trafficAnalysis.analysis.trafficDelayMinutes
      : undefined;

  return route.segments.map((segment, index): ItineraryStep => {
    if (segment.mode === "walk") {
      const isTransfer = index > 0 && index < route.segments.length - 1;
      return {
        id: segment.id,
        mode: "walk",
        isTransfer,
        title: isTransfer ? "Transfer" : "Walk",
        subtitle: segment.end.label,
        durationMinutes: segment.durationMinutes,
        distanceMeters: segment.distanceMeters,
        severity: "neutral",
      };
    }

    if (segment.mode === "cycle") {
      return {
        id: segment.id,
        mode: "cycle",
        isTransfer: false,
        title: "Cycle",
        subtitle: segment.end.label,
        durationMinutes: segment.durationMinutes,
        distanceMeters: segment.distanceMeters,
        severity: "neutral",
      };
    }

    if (segment.mode === "drive") {
      return {
        id: segment.id,
        mode: "drive",
        isTransfer: false,
        title: "Drive",
        durationMinutes: segment.durationMinutes,
        distanceMeters: segment.distanceMeters,
        statusSummary: trafficDelayMinutes !== undefined && trafficDelayMinutes > 0 ? formatTrafficDelay(trafficDelayMinutes) : undefined,
        severity: "neutral",
      };
    }

    // bus / rail
    const matched = transitSegments.find((a) => a.routeSegmentId === segment.id);
    const title = matched?.lineShortName || segment.transitLine?.shortName || (segment.mode === "rail" ? "Rail" : "Bus");

    return {
      id: segment.id,
      mode: segment.mode,
      isTransfer: false,
      title,
      subtitle: segment.transitLine?.headsign ? `Toward ${segment.transitLine.headsign}` : undefined,
      boardStop: matched?.originStop?.name,
      alightStop: matched?.destinationStop?.name,
      statusSummary: matched ? transitSegmentSummary(matched) : undefined,
      severity: matched ? transitSegmentSeverity(matched) : "neutral",
    };
  });
}

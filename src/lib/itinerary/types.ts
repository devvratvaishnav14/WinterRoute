import type { RouteConditionSeverity } from "@/lib/conditions/types";
import type { SegmentTransportMode } from "@/lib/route/types";

export interface ItineraryStep {
  id: string;
  mode: SegmentTransportMode;
  /** Whether this is an in-between walk connecting two transit legs, as opposed to the first/last walk of the trip — shown as "Transfer" rather than plain "Walk". */
  isTransfer: boolean;
  /** e.g. "145", "Expo Line", "Walk", "Drive", "Cycle" — always the most prominent text for this step. */
  title: string;
  /** e.g. "Toward Production Way–University Station" — only present when the provider actually supplied a headsign; never fabricated. */
  subtitle?: string;
  durationMinutes?: number;
  distanceMeters?: number;
  /** Only present when the transit match actually supplied a stop name — never fabricated. */
  boardStop?: string;
  alightStop?: string;
  /** Schedule-only / realtime delay / canceled / traffic-delay text, when known. */
  statusSummary?: string;
  severity: RouteConditionSeverity;
}

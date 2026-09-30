export type TrafficSpeedCondition = "normal" | "slow" | "trafficJam";

/**
 * One stretch of the route's polyline with a Google-reported traffic
 * condition. `distanceMeters` is computed from the traffic-aware
 * response's own real polyline coordinates (summed haversine distance
 * between consecutive points in this interval's index range) — a real
 * distance, not a point-count approximation — which is what makes a
 * defensible route-proportion percentage possible (see
 * `lib/traffic/format.ts`).
 */
export interface TrafficInterval {
  startPolylineIndex: number;
  endPolylineIndex: number;
  condition: TrafficSpeedCondition;
  distanceMeters: number;
}

/**
 * Whether live traffic conditions are directly meaningful for this
 * analysis. "near-term" trips are close enough that Google's traffic-aware
 * estimate reflects genuinely current conditions; "future" trips (up to
 * WinterRoute's 72h limit) get Google's best historical+pattern-based
 * estimate for that future time, which should not be described as a live
 * observation. The threshold is WinterRoute's own pragmatic choice
 * (`NEAR_TERM_THRESHOLD_HOURS` in `lib/traffic/timeline.ts`), not a
 * documented Google cutoff — see docs/architecture.md.
 */
export type TrafficDataRecency = "near-term" | "future";

/**
 * A traffic-aware observation for one DRIVE trip at one specific commute
 * time — distinct from and never a replacement for the route's baseline
 * (`Route.baselineDurationMinutes`, from `lib/route/computeRoute.ts`).
 * Google's own `duration` (traffic-aware) and `staticDuration` (without
 * traffic) are the source for `trafficAwareDurationMinutes` and
 * `googleStaticDurationMinutes` respectively — see docs/architecture.md
 * "staticDuration semantics" for why `googleStaticDurationMinutes` is kept
 * as its own field rather than assumed identical to
 * `referenceBaselineDurationMinutes`, even though they're usually close.
 */
export interface TrafficAnalysis {
  provider: "google-routes";
  analyzedAt: Date;
  /** The commute time this analysis was queried for. */
  commuteDepartureTime: Date;
  /** True only when `commuteDepartureTime` is a nominal (not recommended) baseline for a non-transit "Arrive by" trip — see `lib/traffic/timeline.ts`. */
  isNominalDepartureTime: boolean;
  recency: TrafficDataRecency;
  /** WinterRoute's own existing baseline duration for this route, preserved unchanged — never mutated by this analysis. */
  referenceBaselineDurationMinutes: number;
  /** Google's `staticDuration` from *this* traffic-aware request — "duration of travel through the route without taking traffic conditions into consideration" (Google's own wording). Usually close to but not asserted identical to the baseline above. */
  googleStaticDurationMinutes: number;
  /** Google's `duration` under TRAFFIC_AWARE_OPTIMAL. */
  trafficAwareDurationMinutes: number;
  /** trafficAwareDurationMinutes - googleStaticDurationMinutes, clamped to >= 0 — "Google traffic-related delay estimate," explicitly not "WinterRoute expected delay." */
  trafficDelayMinutes: number;
  trafficModel: "BEST_GUESS";
  distanceMeters: number;
  intervals: TrafficInterval[];
}

export type TrafficAnalysisResult =
  | { status: "analyzed"; analysis: TrafficAnalysis }
  /** The requested mode isn't one Google traffic-aware routing applies to (bus/train/walk/cycle) — see docs/architecture.md "Not all modes are drive." */
  | { status: "not-applicable"; reason: string }
  /** DRIVE, but the Google call itself failed. */
  | { status: "unavailable"; reason: string };

export type RoadEventType =
  | "incident"
  | "construction"
  | "specialEvent"
  | "weatherCondition"
  | "roadCondition"
  | "unknown";

export type RoadEventSeverity = "minor" | "moderate" | "major" | "unknown";

export type RoadEventGeometry =
  | { type: "Point"; coordinates: [number, number] }
  | { type: "LineString"; coordinates: Array<[number, number]> };

/**
 * Whether an event's own schedule was confirmed to overlap the trip's
 * commute time. `"unknown"` means the event's timing data couldn't
 * establish either way — kept in the result rather than silently dropped,
 * per "preserve uncertainty rather than inventing certainty."
 */
export type RoadEventTimeRelevance = "overlaps" | "unknown";

/**
 * Provider-neutral DriveBC/Open511 road event. Direction (`roadDirection`)
 * is preserved as informational metadata only — WinterRoute does not
 * attempt to determine the route's own directionality at the matched
 * point to filter by it (unreliable to do well this stage; see
 * docs/architecture.md "Event direction / road matching").
 */
export interface RoadEvent {
  provider: "drivebc";
  id: string;
  eventType: RoadEventType;
  headline: string;
  description: string;
  severity: RoadEventSeverity;
  createdAt?: Date;
  updatedAt?: Date;
  effectiveStart?: Date;
  effectiveEnd?: Date;
  timeRelevance: RoadEventTimeRelevance;
  roadName?: string;
  roadDirection?: string;
  geometry?: RoadEventGeometry;
}

/**
 * The full traffic picture for one trip. Road events are checked for
 * every mode (they're physically real regardless of how someone travels);
 * `trafficAnalysis` (the Google duration/delay/interval analysis) only
 * ever reaches `"analyzed"` for DRIVE — see docs/architecture.md.
 */
export interface RouteTrafficResult {
  trafficAnalysis: TrafficAnalysisResult;
  roadEvents: RoadEvent[];
  /** Distinguishes "checked, none relevant" from "couldn't check" — never conflate the two. */
  roadEventStatus: "ok" | "unavailable";
}

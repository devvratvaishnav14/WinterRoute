import type { Route, RouteSegment, SegmentTransportMode } from "@/lib/route/types";
import type { TransitSegmentAnalysis } from "@/lib/transit/types";

export interface LatLngLiteral {
  lat: number;
  lng: number;
}

/**
 * A segment's actual road-following path when the provider supplied one
 * (`RouteSegment.geometry`, from the ORIGINAL WinterRoute route
 * computation — never a new browser routing call), else a straight line
 * between its start/end — never silently dropped.
 */
export function segmentPath(segment: RouteSegment): LatLngLiteral[] {
  if (segment.geometry && segment.geometry.length > 0) {
    return segment.geometry.map((p) => ({ lat: p.latitude, lng: p.longitude }));
  }
  return [
    { lat: segment.start.latitude, lng: segment.start.longitude },
    { lat: segment.end.latitude, lng: segment.end.longitude },
  ];
}

/** Whether any segment has real road-following geometry — when false, the map falls back to straight-line segments and origin/destination-only bounds fitting. */
export function routeHasGeometry(route: Route): boolean {
  return route.segments.some((s) => (s.geometry?.length ?? 0) > 0);
}

export function allRoutePoints(route: Route): LatLngLiteral[] {
  const points = route.segments.flatMap(segmentPath);
  if (points.length > 0) return points;
  return [
    { lat: route.origin.latitude, lng: route.origin.longitude },
    { lat: route.destination.latitude, lng: route.destination.longitude },
  ];
}

/**
 * A navigation-app-style route line: a light, high-contrast CASING
 * (halo) underneath, and a narrower, mode-colored ROUTE stroke on top —
 * not one thin identical-looking line for every mode. The casing is
 * intentionally the SAME light color for every mode (the way Google/
 * Uber/Apple Maps all do it) so it reads correctly against roads,
 * parks, water, and labels regardless of basemap style; only the inner
 * route stroke's color/pattern carries the mode identity.
 */
export interface SegmentLineStyle {
  casingColor: string;
  casingOpacity: number;
  casingWeight: number;
  routeColor: string;
  routeOpacity: number;
  routeWeight: number;
  /** Rendered as a dashed inner route line (via Polyline `icons`) — used for walk specifically, so mode is never communicated by color alone (see docs/architecture.md "Map accessibility"). */
  dashed: boolean;
}

/** The shared halo under every segment, any mode. */
const CASING_COLOR = "#f4f7fc";
const CASING_OPACITY = 0.85;
const CASING_WEIGHT = 9;
const ROUTE_WEIGHT = 6;

/**
 * Restrained, WinterRoute-specific palette — not Google's default red/
 * blue, and not a "rainbow route." Each mode gets its own distinguishable
 * hue (never reusing one color across two different modes); walk is
 * additionally dashed, since color alone must never be the only signal
 * distinguishing it. Traffic-condition coloring is intentionally NOT
 * applied here — see docs/architecture.md "Traffic section rendering"
 * for why the existing `TrafficInterval` data can't be spatially located
 * on this geometry.
 */
const MODE_ROUTE_APPEARANCE: Record<SegmentTransportMode, { color: string; dashed: boolean }> = {
  drive: { color: "#16233a", dashed: false }, // dark navy, near-black
  bus: { color: "#2f6fed", dashed: false }, // strong saturated blue
  rail: { color: "#7c3aed", dashed: false }, // indigo, clearly distinct from bus blue
  walk: { color: "#26313f", dashed: true }, // dark charcoal, dashed
  cycle: { color: "#0f9d78", dashed: false }, // strong teal/green
};

export function styleForMode(mode: SegmentTransportMode): SegmentLineStyle {
  const appearance = MODE_ROUTE_APPEARANCE[mode];
  return {
    casingColor: CASING_COLOR,
    casingOpacity: CASING_OPACITY,
    casingWeight: CASING_WEIGHT,
    routeColor: appearance.color,
    routeOpacity: 1,
    routeWeight: ROUTE_WEIGHT,
    dashed: appearance.dashed,
  };
}

export interface LegendEntry {
  mode: SegmentTransportMode;
  label: string;
  style: SegmentLineStyle;
}

const MODE_LABELS: Record<SegmentTransportMode, string> = {
  walk: "Walk",
  cycle: "Cycle",
  bus: "Bus",
  rail: "Rail",
  drive: "Drive",
};

/** Only worth showing when the route actually mixes more than one visually-distinct mode — a single-mode route (all drive, or all bus) needs no legend. */
export function legendEntriesFor(route: Route): LegendEntry[] {
  const modes = Array.from(new Set(route.segments.map((s) => s.mode)));
  if (modes.length <= 1) return [];
  return modes.map((mode) => ({ mode, label: MODE_LABELS[mode], style: styleForMode(mode) }));
}

export interface RouteBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export function boundsFromPoints(points: LatLngLiteral[]): RouteBounds {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  return { north: Math.max(...lats), south: Math.min(...lats), east: Math.max(...lngs), west: Math.min(...lngs) };
}

/** A bounds so small it's effectively one point (e.g. a very short trip) — `fitBounds` on this can zoom unpredictably, so callers should center+zoom instead. */
export function isDegenerateBounds(bounds: RouteBounds): boolean {
  return bounds.north === bounds.south && bounds.east === bounds.west;
}

export interface TransitWaypoint {
  segmentId: string;
  /** 1-indexed boarding order along the route — shown as the marker's number. */
  order: number;
  label: string;
  position: LatLngLiteral;
  title: string;
}

/**
 * A small, numbered marker per transit BOARDING point — never every
 * stop. Only produced when the matched `TransitSegmentAnalysis` actually
 * has real stop coordinates; a transit leg with no matched origin stop
 * is simply omitted, never given a guessed location.
 */
export function transitBoardingWaypoints(route: Route, transitSegments: TransitSegmentAnalysis[]): TransitWaypoint[] {
  const waypoints: TransitWaypoint[] = [];
  let order = 0;

  for (const segment of route.segments) {
    if (segment.mode !== "bus" && segment.mode !== "rail") continue;
    const matched = transitSegments.find((a) => a.routeSegmentId === segment.id);
    const originStop = matched?.originStop;
    if (!originStop) continue;

    order += 1;
    const lineLabel = matched?.lineShortName || segment.transitLine?.shortName || (segment.mode === "rail" ? "Rail" : "Bus");
    waypoints.push({
      segmentId: segment.id,
      order,
      label: String(order),
      position: { lat: originStop.latitude, lng: originStop.longitude },
      title: `Board ${lineLabel} at ${originStop.name}`,
    });
  }

  return waypoints;
}

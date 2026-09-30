import type { Route } from "@/lib/route/types";
import { formatTrafficDelay } from "@/lib/traffic/format";
import { formatDelaySeconds } from "@/lib/transit/format";
import type { TransitAlert, TransitSegmentAnalysis } from "@/lib/transit/types";
import { summarizeTemperatureForResults, summarizeWindForResults } from "@/lib/weather/format";
import { summarizeRouteWeatherOverview } from "@/lib/weather/overview";
import type { WeatherPreviewState } from "@/components/trip/WeatherPreview";
import type { TrafficPreviewState } from "@/components/trip/TrafficPreview";
import type { TransitPreviewState } from "@/components/trip/TransitPreview";
import { deriveWeatherIconKind, type WeatherIconKind } from "@/lib/weatherScene/icon";
import { resolveWeatherScene } from "@/lib/weatherScene/resolveWeatherScene";
import { roadEventSeverity, trafficDelaySeverity, transitSegmentSeverity, weatherAlertSeverity } from "./severity";
import { formatAlertTitle } from "./titleCase";
import type { RouteConditionEmphasis, RouteConditionItem, RouteConditionSeverity } from "./types";
import { buildWeatherHeadlines, type WeatherConditionPresentation } from "./weatherHeadline";

/**
 * Only used internally, to order items by the requested priority within
 * equal severity: official warnings/major disruptions already sort
 * first via severity alone; among ties, precipitation-family weather
 * outranks road, which outranks traffic, which outranks transit, which
 * outranks ordinary weather metrics (temperature/wind).
 */
const SORT_CATEGORY_RANK: Record<string, number> = {
  "weather-hazard": 0,
  road: 1,
  traffic: 2,
  transit: 3,
  "weather-ordinary": 4,
};

interface RankedItem {
  item: RouteConditionItem;
  sortCategory: keyof typeof SORT_CATEGORY_RANK;
}

/** Severe/warning items are always visually primary regardless of category; everything else defaults to compact/supporting unless a category explicitly overrides it (weather's dominant condition headline does, below). */
function defaultEmphasis(severity: RouteConditionSeverity): RouteConditionEmphasis {
  return severity === "severe" || severity === "warning" ? "primary" : "supporting";
}

const AGREEMENT_BADGE: Partial<Record<WeatherConditionPresentation["agreement"], string>> = {
  low: "Possible",
  medium: "Likely",
  high: "Expected",
};

/**
 * The dominant condition (rain/snow genuinely expected) gets the full
 * title+natural-sentence treatment. An inactive precipitation type
 * (e.g. snow, when only rain is happening) stays a compact "Rain / No
 * rain expected"-style line — reusing `presentation.title`/`.sentence`
 * here too would put a full sentence in a supporting row meant to be a
 * single glanceable line.
 */
function precipitationItem(id: string, noun: "rain" | "snow", presentation: WeatherConditionPresentation, active: boolean, severity: RouteConditionSeverity, icon: WeatherIconKind): RankedItem {
  const emphasis: RouteConditionEmphasis = active ? "primary" : "supporting";
  return {
    item: {
      id,
      category: "weather",
      title: active ? presentation.title : noun === "rain" ? "Rain" : "Snow",
      summary: active ? presentation.sentence : `No ${noun} expected`,
      severity,
      emphasis,
      badgeLabel: active ? AGREEMENT_BADGE[presentation.agreement] : undefined,
      icon: active ? icon : undefined,
    },
    sortCategory: active ? "weather-hazard" : "weather-ordinary",
  };
}

function weatherRankedItems(route: Route, weatherState: WeatherPreviewState | null): RankedItem[] {
  if (!weatherState || weatherState.status !== "success") return [];
  const { analysis } = weatherState;
  const overview = summarizeRouteWeatherOverview(analysis);
  if (!overview.hasData) return [];

  const items: RankedItem[] = [];

  if (analysis.alertStatus === "ok") {
    for (const alert of analysis.alerts) {
      items.push({
        item: {
          id: `weather-alert-${alert.id}`,
          category: "weather",
          title: formatAlertTitle(alert.title),
          summary: "Active along part of route",
          severity: weatherAlertSeverity(alert),
          emphasis: "primary",
          // The official provider's own classification word — factual, and more meaningful than the internal severity label.
          badgeLabel: alert.alertType !== "unknown" ? formatAlertTitle(alert.alertType) : undefined,
          source: "Environment and Climate Change Canada",
        },
        sortCategory: "weather-hazard",
      });
    }
  }

  const headlines = buildWeatherHeadlines(analysis, route);
  // Reused for its `sky`/`lightning` fields, which the text headline
  // above doesn't expose — a cheap pure re-derivation (like the sky
  // headline text already does elsewhere), never a second provider call.
  const scene = resolveWeatherScene(analysis, route.origin);
  const icon = deriveWeatherIconKind(scene.sky, scene.precipitationType, scene.lightning, scene.dayPhase);

  if (headlines) {
    const rainActive = headlines.rain.intensity !== "none";
    const snowActive = headlines.snow.intensity !== "none";

    if (!rainActive && !snowActive) {
      // Neither rain nor snow is genuinely expected — the sky condition
      // (clear/partly-cloudy/cloudy/fog) IS the dominant weather answer.
      if (headlines.sky.title) {
        items.push({
          item: { id: "weather-sky", category: "weather", title: headlines.sky.title, summary: headlines.sky.sentence, severity: "neutral", emphasis: "primary", icon },
          sortCategory: "weather-ordinary",
        });
      }
    } else {
      // Rain and/or snow is genuinely expected — each becomes its own
      // row; whichever has real intensity is primary, the other stays a
      // compact "not expected" line rather than being dropped (so a
      // user checking "what about snow?" still gets a direct answer).
      items.push(precipitationItem("weather-rain", "rain", headlines.rain, rainActive, rainActive ? weatherRowSeverity(headlines.rain) : "neutral", icon));
      items.push(precipitationItem("weather-snow", "snow", headlines.snow, snowActive, snowActive ? weatherRowSeverity(headlines.snow) : "neutral", icon));
    }

    if (headlines.strongWind) {
      items.push({
        item: {
          id: "weather-strong-wind",
          category: "weather",
          title: headlines.strongWind.title,
          summary: headlines.strongWind.sentence,
          severity: "warning",
          emphasis: "primary",
        },
        sortCategory: "weather-hazard",
      });
    }
  }

  items.push({
    item: {
      id: "weather-temperature",
      category: "weather",
      title: "Temperature",
      summary: summarizeTemperatureForResults(overview.temperatureRangeC),
      severity: "neutral",
      emphasis: "supporting",
    },
    sortCategory: "weather-ordinary",
  });

  // The compact "Wind" metric is skipped when wind was already promoted
  // to its own prominent condition above — showing both would just be
  // the same fact twice at two different sizes.
  if (!items.some((i) => i.item.id === "weather-strong-wind")) {
    items.push({
      item: { id: "weather-wind", category: "weather", title: "Wind", summary: summarizeWindForResults(overview.windRangeKmh), severity: "neutral", emphasis: "supporting" },
      sortCategory: "weather-ordinary",
    });
  }

  return items;
}

/** Maps a precipitation presentation's intensity to a Route Conditions severity — light is a notice, moderate/heavy read as warning (still never "severe" without an official alert backing it). */
function weatherRowSeverity(presentation: WeatherConditionPresentation): RouteConditionSeverity {
  if (presentation.intensity === "heavy" || presentation.intensity === "moderate") return "warning";
  if (presentation.intensity === "light") return "notice";
  return "neutral";
}

/** Also reused by `lib/itinerary/buildItinerarySteps.ts` so the itinerary and the Route Conditions list never describe the same segment's status differently. */
export function transitSegmentSummary(segment: TransitSegmentAnalysis): string {
  if (segment.realtime?.tripStatus === "canceled") return "Canceled";
  if (segment.status === "matched-with-realtime" && segment.realtime) {
    return segment.realtime.departureDelaySeconds !== undefined ? formatDelaySeconds(segment.realtime.departureDelaySeconds) : "Realtime confirmed";
  }
  if (segment.status === "matched-schedule-only") return "Schedule available · realtime not yet available";
  return "Schedule unavailable";
}

function transitAlertSeverityFromEffect(alert: TransitAlert): RouteConditionSeverity {
  if (alert.effect === "noService") return "severe";
  if (alert.effect === "significantDelays") return "warning";
  return "notice";
}

function transitRankedItems(route: Route, transitState: TransitPreviewState | null): RankedItem[] {
  const hasTransit = route.segments.some((s) => s.mode === "bus" || s.mode === "rail");
  if (!hasTransit || !transitState || transitState.status !== "success") return [];

  const { analysis } = transitState;
  if (analysis.status !== "analyzed") return [];

  const items: RankedItem[] = [];

  for (const segment of analysis.transitSegments) {
    const title = segment.lineShortName || (segment.mode === "rail" ? "Rail" : "Bus");
    const severity = transitSegmentSeverity(segment);
    items.push({
      item: {
        id: `transit-${segment.routeSegmentId}`,
        category: "transit",
        title,
        summary: transitSegmentSummary(segment),
        severity,
        emphasis: defaultEmphasis(severity),
        affectedPortion: segment.destinationStop?.name,
      },
      sortCategory: "transit",
    });

    for (const alert of segment.relevantAlerts) {
      const alertSeverity = transitAlertSeverityFromEffect(alert);
      items.push({
        item: {
          id: `transit-alert-${segment.routeSegmentId}-${alert.id}`,
          category: "transit",
          title,
          summary: alert.headerText,
          severity: alertSeverity,
          emphasis: defaultEmphasis(alertSeverity),
          source: "TransLink",
        },
        sortCategory: "transit",
      });
    }
  }

  for (const alert of analysis.systemAlerts) {
    const severity = transitAlertSeverityFromEffect(alert);
    items.push({
      item: {
        id: `transit-system-alert-${alert.id}`,
        category: "transit",
        title: "System alert",
        summary: alert.headerText,
        severity,
        emphasis: defaultEmphasis(severity),
        source: "TransLink",
      },
      sortCategory: "transit",
    });
  }

  return items;
}

const MAX_ROAD_EVENT_ITEMS = 3;

function roadRankedItems(trafficState: TrafficPreviewState | null): RankedItem[] {
  if (!trafficState || trafficState.status !== "success") return [];
  const { roadEvents, roadEventStatus } = trafficState.result;
  if (roadEventStatus !== "ok") return [];

  // Capped and pre-sorted by severity so a route with many minor DriveBC
  // events doesn't crowd out everything else — the most relevant ones win.
  const bySeverity = [...roadEvents].sort((a, b) => SEVERITY_RANK[roadEventSeverity(a.severity)] - SEVERITY_RANK[roadEventSeverity(b.severity)]);

  return bySeverity.slice(0, MAX_ROAD_EVENT_ITEMS).map((event) => {
    const severity = roadEventSeverity(event.severity);
    return {
      item: {
        id: `road-${event.id}`,
        category: "road" as const,
        title: event.headline,
        summary: event.roadName ?? "Near the route",
        severity,
        emphasis: defaultEmphasis(severity),
      },
      sortCategory: "road" as const,
    };
  });
}

function trafficRankedItems(route: Route, trafficState: TrafficPreviewState | null): RankedItem[] {
  const hasDrive = route.segments.some((s) => s.mode === "drive");
  if (!hasDrive || !trafficState || trafficState.status !== "success") return [];

  const { trafficAnalysis } = trafficState.result;
  if (trafficAnalysis.status !== "analyzed") return [];
  const { trafficDelayMinutes } = trafficAnalysis.analysis;
  if (trafficDelayMinutes <= 0) return [];

  const severity = trafficDelaySeverity(trafficDelayMinutes);
  return [
    {
      item: {
        id: "traffic-delay",
        category: "traffic",
        title: "Traffic",
        summary: formatTrafficDelay(trafficDelayMinutes),
        severity,
        emphasis: defaultEmphasis(severity),
      },
      sortCategory: "traffic",
    },
  ];
}

const SEVERITY_RANK: Record<RouteConditionSeverity, number> = { severe: 0, warning: 1, notice: 2, neutral: 3 };

/**
 * Builds the full, severity-ordered "Route Conditions" list from
 * already-computed weather/traffic/transit results — no new analysis,
 * no new provider calls. Official warnings and factual disruptions
 * (canceled trips, road closures) sort first; ordinary temperature/wind
 * sort last. Only categories actually relevant to this route's mode
 * composition are included.
 */
export function buildRouteConditions(
  route: Route,
  weatherState: WeatherPreviewState | null,
  trafficState: TrafficPreviewState | null,
  transitState: TransitPreviewState | null,
): RouteConditionItem[] {
  const ranked = [
    ...weatherRankedItems(route, weatherState),
    ...roadRankedItems(trafficState),
    ...trafficRankedItems(route, trafficState),
    ...transitRankedItems(route, transitState),
  ];

  ranked.sort((a, b) => {
    const severityDiff = SEVERITY_RANK[a.item.severity] - SEVERITY_RANK[b.item.severity];
    if (severityDiff !== 0) return severityDiff;
    return SORT_CATEGORY_RANK[a.sortCategory] - SORT_CATEGORY_RANK[b.sortCategory];
  });

  return ranked.map((r) => r.item);
}

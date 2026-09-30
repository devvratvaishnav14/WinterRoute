import type { RoadEventSeverity } from "@/lib/traffic/types";
import type { TransitSegmentAnalysis } from "@/lib/transit/types";
import type { WeatherAlert } from "@/lib/weather/types";
import type { WeatherSceneCondition } from "@/lib/weatherScene/types";
import type { RouteConditionSeverity } from "./types";

/**
 * Official ECCC alert severity — PREFERS the provider's own risk colour
 * (`risk_colour_en`, e.g. "Red"/"Orange"/"Yellow"/"Green" — Canada's
 * public-alerting convention) over guessing from the alert-type word
 * ("Warning"/"Watch"/"Advisory"/"Statement"). Falls back to alert type
 * only when no colour was supplied, and to `"notice"` (never an invented
 * `"severe"`) when neither is available.
 */
export function weatherAlertSeverity(alert: WeatherAlert): RouteConditionSeverity {
  const color = alert.severityColor?.toLowerCase();
  if (color?.includes("red")) return "severe";
  if (color?.includes("orange")) return "warning";
  if (color?.includes("yellow")) return "notice";
  if (color?.includes("green")) return "neutral";

  switch (alert.alertType) {
    case "warning":
      return "severe";
    case "watch":
      return "warning";
    case "advisory":
    case "statement":
      return "notice";
    default:
      return "notice";
  }
}

/**
 * Ordinary (non-alert) weather severity, from the SAME resolved
 * `WeatherSceneCondition` already driving the background scene — never
 * a second, independently-derived classification that could disagree
 * with it. Thunderstorm is the only ordinary-forecast condition treated
 * as `"severe"` on its own (an official alert can still raise anything
 * else to severe via `weatherAlertSeverity`); heavy precipitation/
 * freezing rain is `"warning"`; ordinary precipitation/fog is
 * `"notice"`; clear/cloudy/unknown is `"neutral"`.
 */
export function weatherConditionSeverity(condition: WeatherSceneCondition): RouteConditionSeverity {
  switch (condition) {
    case "thunderstorm":
      return "severe";
    case "heavy-rain":
    case "heavy-snow":
    case "freezing-rain":
      return "warning";
    case "rain":
    case "snow":
    case "drizzle":
    case "mixed-precipitation":
    case "fog":
      return "notice";
    default:
      return "neutral";
  }
}

/**
 * Transit segment severity, purely from factual realtime/alert/status
 * fields — never invented from "this line is usually unreliable" or
 * similar. A canceled trip or a `"noService"` alert is `"severe"`; a
 * `"significantDelays"` alert or a skipped stop is `"warning"`; a real
 * but lesser alert or a delay over 1 minute is `"notice"`; a genuine
 * delay of 10+ minutes is `"warning"`. Schedule-only (no realtime yet)
 * is explicitly `"neutral"` — informational, never treated as a
 * disruption on its own.
 */
export function transitSegmentSeverity(segment: TransitSegmentAnalysis): RouteConditionSeverity {
  if (segment.realtime?.tripStatus === "canceled") return "severe";
  if (segment.relevantAlerts.some((a) => a.effect === "noService")) return "severe";

  const delaySeconds = segment.realtime?.departureDelaySeconds ?? segment.realtime?.arrivalDelaySeconds;
  if (delaySeconds !== undefined && delaySeconds >= 600) return "warning";
  if (segment.relevantAlerts.some((a) => a.effect === "significantDelays")) return "warning";
  if (segment.realtime?.departureStopStatus === "skipped" || segment.realtime?.arrivalStopStatus === "skipped") return "warning";

  if (segment.relevantAlerts.length > 0) return "notice";
  if (delaySeconds !== undefined && delaySeconds > 60) return "notice";

  return "neutral";
}

/** Direct pass-through of DriveBC's own severity classification — never re-derived from the event's free-text headline. `"unknown"` gets the conservative `"notice"` treatment, never an invented `"severe"`. */
export function roadEventSeverity(severity: RoadEventSeverity): RouteConditionSeverity {
  switch (severity) {
    case "major":
      return "severe";
    case "moderate":
      return "warning";
    case "minor":
    case "unknown":
      return "notice";
  }
}

/** Ordinary car-traffic delay severity — capped at `"warning"`; ordinary congestion is never presented as `"severe"` (that tier is reserved for official alerts / unambiguous events). */
export function trafficDelaySeverity(delayMinutes: number): RouteConditionSeverity {
  if (delayMinutes >= 10) return "warning";
  if (delayMinutes > 0) return "notice";
  return "neutral";
}

/** Sort weight so `buildRouteConditions` can order severe-first, matching the requested priority (official warnings/major disruptions, then precipitation/road/transit, then ordinary metrics). */
export const SEVERITY_RANK: Record<RouteConditionSeverity, number> = {
  severe: 0,
  warning: 1,
  notice: 2,
  neutral: 3,
};

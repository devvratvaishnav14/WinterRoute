import { pluralize } from "@/lib/scoring/pluralize";
import type { CommuteFeatureSet } from "@/lib/scoring/types";
import { durationModelV0Config } from "./config";
import type { DelayContribution } from "./types";

/**
 * The car/drive timing contributions. The strongest direct evidence is
 * Google's own traffic-aware duration for THIS request — used directly
 * as the central-estimate basis (not `baseline + clamped delta`), which
 * is what lets the central estimate legitimately land below the static
 * baseline when real traffic is genuinely lighter than typical (see
 * docs/decisions/0010-duration-model-v0.md "No negative commute"). Road
 * events and jam/slow route shares are deliberately NOT added as
 * separate minutes here — they already describe the congestion Google's
 * own delay figure measured; adding them again would double-count the
 * same evidence (see "Avoiding double counting" in the ADR).
 */
export function buildCarContributions(features: CommuteFeatureSet, baselineMinutes: number): DelayContribution[] {
  const traffic = features.traffic;
  const contributions: DelayContribution[] = [];

  // A route with no `drive` segment at all (traffic genuinely "not
  // applicable") gets no car-timing contribution whatsoever — this is
  // NOT the same as "unavailable," which means a drive segment exists
  // but its traffic data failed to load.
  if (traffic.availability === "not-applicable") return contributions;

  if (traffic.availability === "available" && traffic.trafficAwareDurationMinutes !== undefined) {
    const delta = traffic.trafficAwareDurationMinutes - baselineMinutes;
    const displayDelay = Math.max(0, delta);
    contributions.push({
      key: "carTrafficTiming",
      label: "Traffic-aware timing",
      centralMinutes: delta,
      lowerMinutes: delta,
      upperMinutes: delta,
      provenance: "observed-provider",
      explanation:
        displayDelay > 0
          ? `Google's traffic-aware routing currently adds about ${Math.round(displayDelay)} min compared with the reference duration.`
          : `Google's traffic-aware routing shows no added delay compared with the reference duration.`,
      appliesTo: "drive",
    });

    const weatherWindow =
      traffic.recency === "near-term"
        ? durationModelV0Config.car.nearTermWeatherUpperWideningMinutes
        : durationModelV0Config.car.futureWeatherUpperWideningMinutes;
    contributions.push(...buildCarWeatherWidening(features, weatherWindow));
  } else {
    // No traffic data at all — widen uncertainty proportionally to baseline rather than assuming typical conditions.
    const { noTrafficUpperWideningMinutesPerHour, maxNoTrafficUpperWideningMinutes } = durationModelV0Config.car;
    const widening = Math.min(maxNoTrafficUpperWideningMinutes, (baselineMinutes / 60) * noTrafficUpperWideningMinutesPerHour);
    if (widening > 0) {
      contributions.push({
        key: "carNoTrafficData",
        label: "No traffic data available",
        centralMinutes: 0,
        lowerMinutes: 0,
        upperMinutes: widening,
        provenance: "heuristic-v0",
        explanation: "Traffic data wasn't available for this trip, so the upper end of the estimate allows extra room for unmeasured congestion.",
        appliesTo: "drive",
      });
    }
    contributions.push(...buildCarWeatherWidening(features, durationModelV0Config.car.futureWeatherUpperWideningMinutes));
  }

  return contributions;
}

function buildCarWeatherWidening(
  features: CommuteFeatureSet,
  windowConfig: { snow: number; freezing: number; heavyPrecipitation: number },
): DelayContribution[] {
  const weather = features.weather;
  if (weather.availability === "unavailable") return [];

  const contributions: DelayContribution[] = [];
  let widening = 0;
  const notes: string[] = [];

  if (weather.maxSnowfallCm && weather.maxSnowfallCm > 0) {
    widening += windowConfig.snow;
    notes.push("snowfall");
  }
  if (features.segments.some((s) => s.mode === "drive" && s.weather.belowFreezingTemperature)) {
    widening += windowConfig.freezing;
    notes.push("below-freezing conditions");
  }
  if (weather.maxPrecipitationMm && weather.maxPrecipitationMm >= 5) {
    widening += windowConfig.heavyPrecipitation;
    notes.push("precipitation");
  }

  if (widening > 0) {
    contributions.push({
      key: "carWeatherUncertainty",
      label: "Weather uncertainty",
      centralMinutes: 0,
      lowerMinutes: 0,
      upperMinutes: widening,
      provenance: "heuristic-v0",
      explanation: `Possible additional delay from ${notes.join(" and ")} isn't independently measured — the upper end of the estimate allows for it.`,
      appliesTo: "drive",
    });
  }

  return contributions;
}

/** Road-event uncertainty applies at the whole-route level, regardless of mode — a real event is physically real whether or not the trip is a drive. Called once by the orchestrator, not nested inside car-only logic. */
export function buildRoadEventWidening(features: CommuteFeatureSet): DelayContribution[] {
  const roadEvents = features.roadEvents;
  if (roadEvents.availability !== "checked" || roadEvents.relevantEventCount === 0) return [];

  const { roadEventUpperWideningMinutes } = durationModelV0Config.car;
  const severity = roadEvents.highestSeverity ?? "unknown";
  const widening = severity === "major" ? roadEventUpperWideningMinutes.major : severity === "moderate" ? roadEventUpperWideningMinutes.moderate : roadEventUpperWideningMinutes.minor;

  return [
    {
      key: "roadEventUncertainty",
      label: "Road event uncertainty",
      centralMinutes: 0,
      lowerMinutes: 0,
      upperMinutes: widening,
      provenance: "heuristic-v0",
      explanation: `${roadEvents.relevantEventCount} relevant road ${pluralize(roadEvents.relevantEventCount, "event")} near the route (highest severity: ${severity}) — no quantified delay is available, so the upper end of the estimate allows extra room.`,
      appliesTo: "route",
    },
  ];
}

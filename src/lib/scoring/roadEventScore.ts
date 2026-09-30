import { riskModelV0Config } from "./config";
import { pluralize } from "./pluralize";
import type { CommuteFeatureSet, FactorContribution, FactorScore } from "./types";

/**
 * RoadEventSeverityScore — checked for every mode (a real road event is
 * physically real regardless of how someone travels past it). Based on
 * pre-aggregated `RouteRoadEventFeatures` counts (not raw `RoadEvent[]`,
 * to keep the scoring layer from depending on provider-shaped data) — the
 * dominant event's severity is approximated by `highestSeverity`, and a
 * blended type multiplier is reconstructed from the category counts
 * (incident/construction/weather/special-event) since the specific type
 * of the single highest-severity event isn't itself preserved as a
 * feature. A "full closure" isn't a real DriveBC field — `majorSeverityEventCount`
 * is the closest defensible proxy, documented in `types.ts`.
 */
export function scoreRoadEventFactor(features: CommuteFeatureSet): FactorScore {
  const roadEvents = features.roadEvents;

  if (roadEvents.availability === "unavailable") {
    return {
      factor: "roadEvents",
      status: "unavailable",
      reason: "Road event data was unavailable for this trip.",
      contributions: [],
    };
  }

  if (roadEvents.relevantEventCount === 0) {
    return { factor: "roadEvents", status: "scored", score: 0, contributions: [] };
  }

  const { severityWeight, typeMultiplier, additionalEventBonus, additionalEventCap } = riskModelV0Config.roadEvents;

  const base = severityWeight[roadEvents.highestSeverity ?? "unknown"];

  const typedCount =
    roadEvents.incidentCount + roadEvents.constructionCount + roadEvents.weatherRelatedEventCount + roadEvents.specialEventCount;
  const unknownCount = Math.max(0, roadEvents.relevantEventCount - typedCount);
  const blendedMultiplier =
    (roadEvents.incidentCount * typeMultiplier.incident +
      roadEvents.constructionCount * typeMultiplier.construction +
      roadEvents.weatherRelatedEventCount * typeMultiplier.weatherCondition +
      roadEvents.specialEventCount * typeMultiplier.specialEvent +
      unknownCount * typeMultiplier.unknown) /
    roadEvents.relevantEventCount;

  const contributions: FactorContribution[] = [
    {
      key: "dominantEvent",
      label: "Most severe road event",
      rawValue: base,
      weight: blendedMultiplier,
      detail: `highest observed severity: ${roadEvents.highestSeverity ?? "unknown"} (${roadEvents.relevantEventCount} relevant ${pluralize(roadEvents.relevantEventCount, "event")} total)`,
    },
  ];

  const additionalCount = roadEvents.relevantEventCount - 1;
  let bonus = 0;
  if (additionalCount > 0) {
    // Additional major-severity events count more heavily toward the bonus than ordinary ones.
    const majorWeight = Math.min(additionalCount, roadEvents.majorSeverityEventCount) * additionalEventBonus * 1.5;
    const otherWeight = Math.max(0, additionalCount - roadEvents.majorSeverityEventCount) * additionalEventBonus;
    bonus = Math.min(additionalEventCap, majorWeight + otherWeight);
    contributions.push({
      key: "additionalEvents",
      label: "Additional relevant events",
      rawValue: bonus,
      weight: 1,
      detail: `${additionalCount} additional relevant ${pluralize(additionalCount, "event")}, ${roadEvents.majorSeverityEventCount} of major severity`,
    });
  }

  const overall = Math.min(100, base * blendedMultiplier + bonus);
  return { factor: "roadEvents", status: "scored", score: Math.round(overall), contributions };
}

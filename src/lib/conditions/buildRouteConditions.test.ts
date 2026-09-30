import { describe, expect, it } from "vitest";
import {
  forecast,
  route,
  segment,
  trafficAnalysis,
  trafficResult,
  transitAnalysis,
  transitSegmentAnalysis,
  weatherAnalysis,
  weatherSample,
} from "@/lib/scoring/fixtures";
import type { WeatherPreviewState } from "@/components/trip/WeatherPreview";
import type { TrafficPreviewState } from "@/components/trip/TrafficPreview";
import type { TransitPreviewState } from "@/components/trip/TransitPreview";
import { buildRouteConditions } from "./buildRouteConditions";

const carRoute = route([segment({ mode: "drive" })]);
const transitRoute = route([segment({ mode: "walk" }), segment({ mode: "bus" }), segment({ mode: "walk" })]);
const walkRoute = route([segment({ mode: "walk" })]);

const weatherWithAlert: WeatherPreviewState = {
  status: "success",
  analysis: weatherAnalysis({
    samples: [weatherSample(undefined, [forecast({ weatherCode: 61, precipitationMm: 3, temperatureC: 12, windSpeedKmh: 8 })])],
    alerts: [{ provider: "eccc", id: "a1", alertType: "warning", title: "rainfall warning", summary: "" }],
  }),
};

describe("buildRouteConditions", () => {
  it("places an official alert before ordinary temperature", () => {
    const items = buildRouteConditions(walkRoute, weatherWithAlert, null, null);
    const alertIndex = items.findIndex((i) => i.title === "Rainfall Warning");
    const tempIndex = items.findIndex((i) => i.title === "Temperature");
    expect(alertIndex).toBeGreaterThanOrEqual(0);
    expect(tempIndex).toBeGreaterThan(alertIndex);
  });

  it("shows the official alert source unobtrusively", () => {
    const items = buildRouteConditions(walkRoute, weatherWithAlert, null, null);
    const alert = items.find((i) => i.title === "Rainfall Warning");
    expect(alert?.source).toBe("Environment and Climate Change Canada");
  });

  it("title-cases the alert", () => {
    const items = buildRouteConditions(walkRoute, weatherWithAlert, null, null);
    expect(items.find((i) => i.category === "weather" && i.severity === "severe")?.title).toBe("Rainfall Warning");
  });

  it("hides transit and traffic items entirely for a pure walking route", () => {
    const items = buildRouteConditions(walkRoute, weatherWithAlert, null, null);
    expect(items.some((i) => i.category === "transit")).toBe(false);
    expect(items.some((i) => i.category === "traffic")).toBe(false);
  });

  it("still renders weather conditions for a car route", () => {
    const items = buildRouteConditions(carRoute, weatherWithAlert, { status: "success", result: trafficResult() }, null);
    expect(items.some((i) => i.category === "weather")).toBe(true);
  });

  it("shows a traffic item only when there is a genuine delay", () => {
    const withDelay = buildRouteConditions(
      carRoute,
      null,
      { status: "success", result: trafficResult({ trafficAnalysis: { status: "analyzed", analysis: trafficAnalysis({ trafficDelayMinutes: 8 }) } }) },
      null,
    );
    expect(withDelay.some((i) => i.category === "traffic")).toBe(true);

    const withoutDelay = buildRouteConditions(carRoute, null, { status: "success", result: trafficResult() }, null);
    expect(withoutDelay.some((i) => i.category === "traffic")).toBe(false);
  });

  it("still renders transit conditions for a transit route", () => {
    const transitState: TransitPreviewState = {
      status: "success",
      analysis: transitAnalysis({ transitSegments: [transitSegmentAnalysis({ status: "matched-schedule-only" })] }),
    };
    const items = buildRouteConditions(transitRoute, null, null, transitState);
    expect(items.some((i) => i.category === "transit")).toBe(true);
  });

  it("never invents severity when the traffic provider is unavailable", () => {
    const unavailableTraffic: TrafficPreviewState = { status: "error", message: "network error" };
    const items = buildRouteConditions(carRoute, null, unavailableTraffic, null);
    expect(items.some((i) => i.category === "traffic" || i.category === "road")).toBe(false);
  });

  it("produces no items when nothing has resolved yet", () => {
    expect(buildRouteConditions(carRoute, null, null, null)).toEqual([]);
  });
});

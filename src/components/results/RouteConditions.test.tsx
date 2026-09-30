// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { RouteConditions } from "./RouteConditions";
import { forecast, route, segment, trafficResult, transitAnalysis, transitSegmentAnalysis, weatherAnalysis, weatherSample } from "./fixtures";
import type { WeatherPreviewState } from "@/components/trip/WeatherPreview";
import type { TrafficPreviewState } from "@/components/trip/TrafficPreview";
import type { TransitPreviewState } from "@/components/trip/TransitPreview";

afterEach(cleanup);

const walkRoute = route([segment({ mode: "walk" })]);
const carRoute = route([segment({ mode: "drive" })]);
const transitRoute = route([segment({ mode: "walk" }), segment({ mode: "bus" }), segment({ mode: "walk" })]);

describe("RouteConditions", () => {
  it("shows a severity text label, not just a color, for a non-neutral item", () => {
    const weatherState: WeatherPreviewState = {
      status: "success",
      analysis: weatherAnalysis({
        samples: [weatherSample(undefined, [forecast()])],
        alerts: [{ provider: "eccc", id: "a1", alertType: "warning", title: "rainfall warning", summary: "" }],
      }),
    };
    render(<RouteConditions route={walkRoute} weatherState={weatherState} trafficState={null} transitState={null} />);

    expect(screen.getByText("Rainfall Warning")).toBeTruthy();
    expect(screen.getByText("Warning")).toBeTruthy();
  });

  it("shows the official alert source unobtrusively", () => {
    const weatherState: WeatherPreviewState = {
      status: "success",
      analysis: weatherAnalysis({
        samples: [weatherSample(undefined, [forecast()])],
        alerts: [{ provider: "eccc", id: "a1", alertType: "advisory", title: "special weather statement", summary: "" }],
      }),
    };
    render(<RouteConditions route={walkRoute} weatherState={weatherState} trafficState={null} transitState={null} />);

    expect(screen.getByText("Special Weather Statement")).toBeTruthy();
    expect(screen.getByText("Environment and Climate Change Canada")).toBeTruthy();
  });

  it("hides transit and traffic categories for a pure walking route", () => {
    const weatherState: WeatherPreviewState = { status: "success", analysis: weatherAnalysis({ samples: [weatherSample(undefined, [forecast()])] }) };
    render(<RouteConditions route={walkRoute} weatherState={weatherState} trafficState={null} transitState={null} />);

    expect(screen.queryByText("Transit")).toBeNull();
    expect(screen.queryByText("Traffic")).toBeNull();
  });

  it("still renders for a car route", () => {
    const weatherState: WeatherPreviewState = { status: "success", analysis: weatherAnalysis({ samples: [weatherSample(undefined, [forecast()])] }) };
    const trafficState: TrafficPreviewState = { status: "success", result: trafficResult() };
    render(<RouteConditions route={carRoute} weatherState={weatherState} trafficState={trafficState} transitState={null} />);

    expect(screen.getByText("Route conditions")).toBeTruthy();
  });

  it("still renders for a transit route", () => {
    const transitState: TransitPreviewState = {
      status: "success",
      analysis: transitAnalysis({ transitSegments: [transitSegmentAnalysis({ status: "matched-schedule-only", lineShortName: "145" })] }),
    };
    render(<RouteConditions route={transitRoute} weatherState={null} trafficState={null} transitState={transitState} />);

    expect(screen.getByText("145")).toBeTruthy();
  });

  it("never invents a green/confirmed-fine state when the traffic provider is unavailable — shows a plain unavailable notice instead", () => {
    const trafficState: TrafficPreviewState = { status: "error", message: "network error" };
    render(<RouteConditions route={carRoute} weatherState={null} trafficState={trafficState} transitState={null} />);

    expect(screen.getByText("Traffic data unavailable")).toBeTruthy();
    expect(screen.queryByText("Traffic")).toBeNull();
  });

  it("renders nothing when no source has resolved and nothing is loading/errored", () => {
    const { container } = render(<RouteConditions route={carRoute} weatherState={null} trafficState={null} transitState={null} />);
    expect(container.textContent).toBe("");
  });

  it("states the actual rain condition directly, not just model agreement", () => {
    const weatherState: WeatherPreviewState = {
      status: "success",
      analysis: weatherAnalysis({
        samples: [weatherSample(undefined, [forecast({ precipitationMm: 1, weatherCode: 61 })])],
      }),
    };
    render(<RouteConditions route={walkRoute} weatherState={weatherState} trafficState={null} transitState={null} />);

    expect(screen.getByText(/Light Rain/)).toBeTruthy();
  });

  it("shows model agreement as a secondary detail line under the headline, not as the headline itself", () => {
    const weatherState: WeatherPreviewState = {
      status: "success",
      analysis: weatherAnalysis({
        samples: [weatherSample(undefined, [forecast({ precipitationMm: 1, weatherCode: 61 })])],
      }),
    };
    render(<RouteConditions route={walkRoute} weatherState={weatherState} trafficState={null} transitState={null} />);

    expect(screen.getByText(/forecast model/)).toBeTruthy();
    expect(screen.queryByText("Forecast models disagree")).toBeNull();
  });

  it("states a clear/cloudy sky condition when there is no real precipitation", () => {
    const weatherState: WeatherPreviewState = {
      status: "success",
      analysis: weatherAnalysis({ samples: [weatherSample(undefined, [forecast({ weatherCode: 0, precipitationMm: 0 })])] }),
    };
    render(<RouteConditions route={walkRoute} weatherState={weatherState} trafficState={null} transitState={null} />);

    expect(screen.getByText(/Clear conditions/)).toBeTruthy();
  });
});

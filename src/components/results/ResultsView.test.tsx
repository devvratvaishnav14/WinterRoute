// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { formatTripTime } from "@/lib/trip/format";
import type { TripRequest } from "@/lib/trip/types";
import { ResultsView } from "./ResultsView";
import { durationState, forecast, riskState, route, segment, timingState, weatherAnalysis, weatherSample } from "./fixtures";

afterEach(cleanup);

const carRoute = route([segment({ mode: "drive" })], {
  origin: { label: "SFU Burnaby", latitude: 49.28, longitude: -122.92 },
  destination: { label: "Downtown Vancouver", latitude: 49.28, longitude: -123.12 },
});

const tripRequest: TripRequest = {
  origin: carRoute.origin,
  destination: carRoute.destination,
  timePreference: "arriveBy",
  dateTime: new Date("2026-09-25T16:00:00Z"),
  mode: "car",
};

const forbiddenFullnessWords = /crowd|occupanc|capacity|\bfull\b|fullness/i;

describe("ResultsView", () => {
  it("stays usable (timing, duration, disruption still render) when the map is unavailable in this environment", async () => {
    // No NEXT_PUBLIC_GOOGLE_MAP_ID is configured for the test process, so
    // RouteMap resolves to its own "Route map unavailable" state — this
    // proves that never breaks the rest of the results.
    render(
      <ResultsView
        tripRequest={tripRequest}
        route={carRoute}
        providerWarnings={[]}
        routeState={{ status: "success", route: carRoute, providerWarnings: [] }}
        weatherState={null}
        trafficState={null}
        transitState={null}
        riskState={riskState({ predictionStatus: "available", overallIndex: 10, label: "Low" })}
        durationState={durationState({ predictionStatus: "available" })}
        timingState={timingState({
          preference: "arriveBy",
          status: "available",
          arriveBy: { targetArrivalTime: new Date("2026-09-25T16:00:00Z"), recommendedDepartureTime: new Date("2026-09-25T15:20:00Z") },
        })}
        onEditTrip={() => {}}
      />,
    );

    expect(await screen.findByText("Route map unavailable")).toBeTruthy();
    expect(screen.getByText("Leave by")).toBeTruthy();
    expect(screen.getByText("Expected journey")).toBeTruthy();
    expect(screen.getByText("Commute disruption")).toBeTruthy();
  });


  it("renders the full hierarchy for a car trip and calls back on Edit trip", async () => {
    const user = userEvent.setup();
    const onEditTrip = vi.fn();

    render(
      <ResultsView
        tripRequest={tripRequest}
        route={carRoute}
        providerWarnings={[]}
        routeState={{ status: "success", route: carRoute, providerWarnings: [] }}
        weatherState={null}
        trafficState={null}
        transitState={null}
        riskState={riskState({ predictionStatus: "available", overallIndex: 40, label: "Moderate" })}
        durationState={durationState({ predictionStatus: "available" })}
        timingState={timingState({
          preference: "arriveBy",
          status: "available",
          arriveBy: { targetArrivalTime: new Date("2026-09-25T16:00:00Z"), recommendedDepartureTime: new Date("2026-09-25T15:20:00Z") },
        })}
        onEditTrip={onEditTrip}
      />,
    );

    expect(screen.getByText("SFU Burnaby")).toBeTruthy();
    expect(screen.getByText("Downtown Vancouver")).toBeTruthy();
    expect(screen.getByText("Leave by")).toBeTruthy();
    expect(screen.getByText("Expected journey")).toBeTruthy();
    expect(screen.getByText("Commute disruption")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Edit trip" }));
    expect(onEditTrip).toHaveBeenCalledOnce();
  });

  it("no longer shows the Route Note block in the main results UI, even when a real provider warning exists", () => {
    const { container } = render(
      <ResultsView
        tripRequest={tripRequest}
        route={carRoute}
        providerWarnings={["Walking and cycling directions are in beta and may not always reflect real-world conditions."]}
        routeState={{ status: "success", route: carRoute, providerWarnings: ["Walking and cycling directions are in beta and may not always reflect real-world conditions."] }}
        weatherState={null}
        trafficState={null}
        transitState={null}
        riskState={riskState()}
        durationState={durationState()}
        timingState={timingState()}
        onEditTrip={() => {}}
      />,
    );

    expect(screen.queryByText("Route note")).toBeNull();
    expect(screen.queryByText("Show details")).toBeNull();
    expect(container.textContent).not.toMatch(/beta and may not always reflect/);
  });

  it("preserves required attribution inside Details, even when collapsed by default", async () => {
    const user = userEvent.setup();

    render(
      <ResultsView
        tripRequest={tripRequest}
        route={carRoute}
        providerWarnings={[]}
        routeState={{ status: "success", route: carRoute, providerWarnings: [] }}
        weatherState={null}
        trafficState={null}
        transitState={null}
        riskState={riskState()}
        durationState={durationState()}
        timingState={timingState()}
        onEditTrip={() => {}}
      />,
    );

    expect(screen.queryByText(/Open-Meteo/)).toBeNull();
    await user.click(screen.getByText("How WinterRoute calculated this"));
    expect(screen.getByText(/Open-Meteo/)).toBeTruthy();
    expect(screen.getByText(/TransLink/)).toBeTruthy();
  });

  it("normal, no-disruption Leave-At trip: no redundant '10:14-10:14', no repeated typical, no manufactured Why", () => {
    // Structurally equivalent to the live case that exposed these bugs
    // (a short, low-disruption car trip where expected == baseline and
    // expected arrival == typical arrival) — deliberately not the exact
    // reported trip, just the same shape.
    const selectedDepartureTime = new Date("2026-09-25T17:00:00Z");
    const arrival = new Date("2026-09-25T17:14:00Z");

    render(
      <ResultsView
        tripRequest={{ ...tripRequest, timePreference: "leaveAt" }}
        route={carRoute}
        providerWarnings={[]}
        routeState={{ status: "success", route: carRoute, providerWarnings: [] }}
        weatherState={null}
        trafficState={null}
        transitState={null}
        riskState={riskState({ predictionStatus: "available", overallIndex: 0, label: "Low" })}
        durationState={durationState({ predictionStatus: "available", baselineDurationMinutes: 14, lowerBoundMinutes: 14, upperBoundMinutes: 14 })}
        timingState={timingState({
          preference: "leaveAt",
          status: "available",
          leaveAt: {
            selectedDepartureTime,
            typicalArrivalTime: arrival,
            expectedArrivalLower: arrival,
            expectedArrivalUpper: arrival,
            arrivalDifferenceFromTypicalMinutes: { lower: 0, upper: 0 },
          },
          summarySentences: [`Based on current conditions, you're expected to arrive around ${formatTripTime(arrival)}.`],
          explanation: [],
        })}
        onEditTrip={() => {}}
      />,
    );

    // Hero: single arrival time, never "<time>-<time>".
    const arrivalLabel = formatTripTime(arrival);
    expect(screen.getAllByText(arrivalLabel).length).toBeGreaterThan(0);
    expect(screen.queryByText(new RegExp(`${arrivalLabel}.${arrivalLabel}`))).toBeNull();
    expect(screen.queryByText(/Typical arrival/)).toBeNull();

    // Journey card: single duration, no redundant "Typical 14 min" line.
    expect(screen.getAllByText("14 min").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Typical 14 min/)).toBeNull();

    // Disruption: understandable label, index secondary, no probability language.
    expect(screen.getByText("Commute disruption")).toBeTruthy();
    expect(screen.getByText("Low")).toBeTruthy();
    expect(screen.queryByText(/0%/)).toBeNull();

    // Why: neutral "At a glance", not a manufactured "different" claim.
    expect(screen.getByText("At a glance")).toBeTruthy();
    expect(screen.queryByText("Why this commute is different")).toBeNull();
  });

  it("Route Conditions appears before the map, matching the approved mobile hierarchy", () => {
    const { container } = render(
      <ResultsView
        tripRequest={tripRequest}
        route={carRoute}
        providerWarnings={[]}
        routeState={{ status: "success", route: carRoute, providerWarnings: [] }}
        weatherState={{
          status: "success",
          analysis: weatherAnalysis({ samples: [weatherSample(undefined, [forecast({ temperatureC: 10, windSpeedKmh: 8 })])] }),
        }}
        trafficState={null}
        transitState={null}
        riskState={riskState()}
        durationState={durationState()}
        timingState={timingState()}
        onEditTrip={() => {}}
      />,
    );

    const text = container.textContent ?? "";
    const conditionsIndex = text.indexOf("Route conditions");
    const mapIndex = text.indexOf("Route map unavailable");
    expect(conditionsIndex).toBeGreaterThan(-1);
    expect(mapIndex).toBeGreaterThan(-1);
    expect(conditionsIndex).toBeLessThan(mapIndex);
  });

  it("gives a transit route a side-by-side map+itinerary layout with the map taking the majority width", () => {
    const transitRoute = route([segment({ mode: "walk" }), segment({ mode: "bus" }), segment({ mode: "walk" })], {
      origin: carRoute.origin,
      destination: carRoute.destination,
    });
    const { container } = render(
      <ResultsView
        tripRequest={tripRequest}
        route={transitRoute}
        providerWarnings={[]}
        routeState={{ status: "success", route: transitRoute, providerWarnings: [] }}
        weatherState={null}
        trafficState={null}
        transitState={null}
        riskState={riskState()}
        durationState={durationState()}
        timingState={timingState()}
        onEditTrip={() => {}}
      />,
    );

    // Map gets the larger share (2fr) of a two-column grid, itinerary the smaller (1fr) — only at desktop widths (lg:).
    expect(container.querySelector('[class*="lg:grid-cols-[2fr_1fr]"]')).not.toBeNull();
  });

  it("does not reserve a fixed side itinerary column for a simple single-step route — the map stays full width", () => {
    const { container } = render(
      <ResultsView
        tripRequest={tripRequest}
        route={carRoute}
        providerWarnings={[]}
        routeState={{ status: "success", route: carRoute, providerWarnings: [] }}
        weatherState={null}
        trafficState={null}
        transitState={null}
        riskState={riskState()}
        durationState={durationState()}
        timingState={timingState()}
        onEditTrip={() => {}}
      />,
    );

    expect(container.querySelector('[class*="grid-cols-["]')).toBeNull();
    expect(screen.getByText("Route map unavailable")).toBeTruthy();
    expect(screen.getByText("Your route")).toBeTruthy();
  });

  it("shows a 'Preview my commute' control for a route with segments", () => {
    render(
      <ResultsView
        tripRequest={tripRequest}
        route={carRoute}
        providerWarnings={[]}
        routeState={{ status: "success", route: carRoute, providerWarnings: [] }}
        weatherState={null}
        trafficState={null}
        transitState={null}
        riskState={riskState()}
        durationState={durationState()}
        timingState={timingState()}
        onEditTrip={() => {}}
      />,
    );

    expect(screen.getByText("Preview my commute")).toBeTruthy();
  });

  it("starting the preview does not change the displayed risk/duration/timing values (visual-only)", async () => {
    const user = userEvent.setup();
    render(
      <ResultsView
        tripRequest={tripRequest}
        route={carRoute}
        providerWarnings={[]}
        routeState={{ status: "success", route: carRoute, providerWarnings: [] }}
        weatherState={null}
        trafficState={null}
        transitState={null}
        riskState={riskState({ predictionStatus: "available", overallIndex: 40, label: "Moderate" })}
        durationState={durationState({ predictionStatus: "available", baselineDurationMinutes: 14, lowerBoundMinutes: 14, upperBoundMinutes: 14 })}
        timingState={timingState({
          preference: "arriveBy",
          status: "available",
          arriveBy: { targetArrivalTime: new Date("2026-09-25T16:00:00Z"), recommendedDepartureTime: new Date("2026-09-25T15:20:00Z") },
        })}
        onEditTrip={() => {}}
      />,
    );

    expect(screen.getByText("Moderate")).toBeTruthy();
    expect(screen.getAllByText("14 min").length).toBeGreaterThan(0);

    await user.click(screen.getByText("Preview my commute"));

    // Playback controls swap in...
    expect(screen.getByText("Pause")).toBeTruthy();
    // ...but every real trip figure is untouched.
    expect(screen.getByText("Moderate")).toBeTruthy();
    expect(screen.getAllByText("14 min").length).toBeGreaterThan(0);
  });

  it("disables manual segment selection while the preview is playing (clicking the itinerary step does nothing)", async () => {
    const user = userEvent.setup();
    const transitRoute = route([segment({ id: "w1", mode: "walk" }), segment({ id: "b1", mode: "bus" })], {
      origin: carRoute.origin,
      destination: carRoute.destination,
    });
    render(
      <ResultsView
        tripRequest={tripRequest}
        route={transitRoute}
        providerWarnings={[]}
        routeState={{ status: "success", route: transitRoute, providerWarnings: [] }}
        weatherState={null}
        trafficState={null}
        transitState={null}
        riskState={riskState()}
        durationState={durationState()}
        timingState={timingState()}
        onEditTrip={() => {}}
      />,
    );

    await user.click(screen.getByText("Preview my commute"));
    // With manual selection disabled, clicking a step must not throw and must not crash the playback controls.
    await user.click(screen.getByText("Walk"));
    expect(screen.getByText("Pause")).toBeTruthy();
  });

  it("never mentions bus fullness/crowding/occupancy anywhere in the composed results", () => {
    const { container } = render(
      <ResultsView
        tripRequest={tripRequest}
        route={carRoute}
        providerWarnings={[]}
        routeState={{ status: "success", route: carRoute, providerWarnings: [] }}
        weatherState={null}
        trafficState={null}
        transitState={null}
        riskState={riskState()}
        durationState={durationState()}
        timingState={timingState()}
        onEditTrip={() => {}}
      />,
    );

    expect(forbiddenFullnessWords.test(container.textContent ?? "")).toBe(false);
  });
});

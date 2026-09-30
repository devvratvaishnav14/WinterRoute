// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TripItinerary } from "./TripItinerary";
import { route, segment, transitAnalysis, transitSegmentAnalysis } from "./fixtures";
import type { TransitPreviewState } from "@/components/trip/TransitPreview";

afterEach(cleanup);

const forbiddenFullnessWords = /crowd|occupanc|capacity|\bfull\b|fullness/i;

describe("TripItinerary", () => {
  it("keeps the 'Your route' heading exactly as-is — never renamed", () => {
    const carRoute = route([segment({ id: "d1", mode: "drive" })]);
    render(<TripItinerary route={carRoute} transitState={null} trafficState={null} />);
    expect(screen.getByText("Your route")).toBeTruthy();
  });

  it("shows a compact summary for a pure car route, without board/get-off transit language", () => {
    const carRoute = route([segment({ id: "d1", mode: "drive", durationMinutes: 29, distanceMeters: 18400 })]);
    render(<TripItinerary route={carRoute} transitState={null} trafficState={null} />);

    expect(screen.getByText("Drive")).toBeTruthy();
    expect(screen.queryByText(/Board at/)).toBeNull();
    expect(screen.queryByText(/Get off at/)).toBeNull();
  });

  it("shows a compact summary for a pure walking route", () => {
    const walkRoute = route([segment({ id: "w1", mode: "walk", durationMinutes: 14, distanceMeters: 1100 })]);
    render(<TripItinerary route={walkRoute} transitState={null} trafficState={null} />);

    expect(screen.getByText("Walk")).toBeTruthy();
    expect(screen.queryByText(/Board at/)).toBeNull();
  });

  it("shows the line number, headsign, and board/alight stops for a transit route", () => {
    const transitRoute = route([
      segment({ id: "w1", mode: "walk" }),
      segment({ id: "b1", mode: "bus", transitLine: { shortName: "145", longName: "", headsign: "Production Way–University Station", agencyName: "TransLink" } }),
      segment({ id: "w2", mode: "walk" }),
    ]);
    const transitState: TransitPreviewState = {
      status: "success",
      analysis: transitAnalysis({
        transitSegments: [
          transitSegmentAnalysis({
            routeSegmentId: "b1",
            lineShortName: "145",
            originStop: { providerStopId: "1", name: "SFU Transportation Centre", latitude: 49.28, longitude: -122.92 },
            destinationStop: { providerStopId: "2", name: "Production Way–University Station", latitude: 49.25, longitude: -122.92 },
          }),
        ],
      }),
    };
    render(<TripItinerary route={transitRoute} transitState={transitState} trafficState={null} />);

    expect(screen.getByText("145")).toBeTruthy();
    expect(screen.getByText("Toward Production Way–University Station")).toBeTruthy();
    expect(screen.getByText("Board at SFU Transportation Centre")).toBeTruthy();
    expect(screen.getByText("Get off at Production Way–University Station")).toBeTruthy();
  });

  it("labels the middle walk between two transit legs as 'Transfer'", () => {
    const r = route([
      segment({ id: "w1", mode: "walk" }),
      segment({ id: "b1", mode: "bus" }),
      segment({ id: "w2", mode: "walk" }),
      segment({ id: "b2", mode: "bus" }),
      segment({ id: "w3", mode: "walk" }),
    ]);
    render(<TripItinerary route={r} transitState={null} trafficState={null} />);

    expect(screen.getByText("Transfer")).toBeTruthy();
  });

  it("calls onSelectStep with the segment id when a step is clicked", async () => {
    const user = userEvent.setup();
    const onSelectStep = vi.fn();
    const r = route([segment({ id: "d1", mode: "drive" })]);
    render(<TripItinerary route={r} transitState={null} trafficState={null} onSelectStep={onSelectStep} />);

    await user.click(screen.getByText("Drive"));
    expect(onSelectStep).toHaveBeenCalledWith("d1");
  });

  it("never mentions bus fullness/crowding/occupancy", () => {
    const r = route([segment({ id: "b1", mode: "bus" })]);
    const transitState: TransitPreviewState = {
      status: "success",
      analysis: transitAnalysis({ transitSegments: [transitSegmentAnalysis({ routeSegmentId: "b1", status: "matched-with-realtime", realtime: { tripStatus: "scheduled", departureDelaySeconds: 60 } })] }),
    };
    const { container } = render(<TripItinerary route={r} transitState={transitState} trafficState={null} />);
    expect(forbiddenFullnessWords.test(container.textContent ?? "")).toBe(false);
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DataCoverageBadge } from "./DataCoverageBadge";
import { segment, trafficResult, transitAnalysis, transitSegmentAnalysis, weatherAnalysis } from "./fixtures";

afterEach(cleanup);

const driveSegments = [segment({ mode: "drive" })];
const transitSegments = [segment({ mode: "walk" }), segment({ mode: "bus" }), segment({ mode: "walk" })];

describe("DataCoverageBadge", () => {
  it("reads Good when every attempted source came back", () => {
    render(
      <DataCoverageBadge
        segments={driveSegments}
        weatherState={{ status: "success", analysis: weatherAnalysis() }}
        trafficState={{ status: "success", result: trafficResult() }}
        transitState={null}
      />,
    );

    expect(screen.getByText(/Data coverage: Good/)).toBeTruthy();
  });

  it("reads Limited data when a source genuinely failed", () => {
    render(
      <DataCoverageBadge
        segments={driveSegments}
        weatherState={{ status: "error", message: "down" }}
        trafficState={{ status: "success", result: trafficResult() }}
        transitState={null}
      />,
    );

    expect(screen.getByText(/Data coverage: Limited data/)).toBeTruthy();
  });

  it("treats a future schedule-only transit trip (no realtime yet) as normal coverage, not limited", () => {
    render(
      <DataCoverageBadge
        segments={transitSegments}
        weatherState={{ status: "success", analysis: weatherAnalysis() }}
        trafficState={null}
        transitState={{
          status: "success",
          analysis: transitAnalysis({ transitSegments: [transitSegmentAnalysis({ status: "matched-schedule-only" })] }),
        }}
      />,
    );

    expect(screen.getByText(/Data coverage: Good/)).toBeTruthy();
  });

  it("expands to show a per-source detail list with no invented percentage", async () => {
    const user = userEvent.setup();
    render(
      <DataCoverageBadge
        segments={driveSegments}
        weatherState={{ status: "success", analysis: weatherAnalysis() }}
        trafficState={{ status: "success", result: trafficResult() }}
        transitState={null}
      />,
    );

    expect(screen.queryByText("Weather")).toBeNull();
    await user.click(screen.getByRole("button"));
    expect(screen.getByText("Weather")).toBeTruthy();
    expect(screen.getByText("Traffic")).toBeTruthy();

    const badgeContainer = screen.getByRole("button").parentElement;
    expect(badgeContainer?.textContent?.includes("%")).toBe(false);
  });
});

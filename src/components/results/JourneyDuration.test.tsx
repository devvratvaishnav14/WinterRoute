// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { JourneyDuration } from "./JourneyDuration";
import { durationState } from "./fixtures";

afterEach(cleanup);

describe("JourneyDuration", () => {
  it("shows Unavailable, never a fake number, when duration data is insufficient", () => {
    render(<JourneyDuration state={durationState({ predictionStatus: "insufficient-data" })} />);

    expect(screen.getByText("Unavailable")).toBeTruthy();
  });

  it("uses 'no additional delay' wording, never negative-delay phrasing, when the range matches the baseline", () => {
    render(
      <JourneyDuration
        state={durationState({
          predictionStatus: "available",
          baselineDurationMinutes: 43,
          lowerBoundMinutes: 43,
          upperBoundMinutes: 43,
        })}
      />,
    );

    expect(screen.getByText(/No additional delay currently expected/)).toBeTruthy();
    expect(screen.queryByText(/-\d/)).toBeNull();
    // Don't redundantly repeat "Typical 43 min" right next to an identical range.
    expect(screen.queryByText(/Typical/)).toBeNull();
  });

  it("shows the typical/additional-time comparison only when there's a genuine difference", () => {
    render(
      <JourneyDuration
        state={durationState({
          predictionStatus: "available",
          baselineDurationMinutes: 14,
          lowerBoundMinutes: 22,
          upperBoundMinutes: 27,
        })}
      />,
    );

    expect(screen.getByText(/Typical 14 min/)).toBeTruthy();
    expect(screen.getByText(/Additional \+8 to \+13 min/)).toBeTruthy();
  });

  it("Arrive-By style collapsed range: shows a single duration, not '55-55 min'", () => {
    render(
      <JourneyDuration
        state={durationState({
          predictionStatus: "available",
          baselineDurationMinutes: 43,
          lowerBoundMinutes: 55,
          upperBoundMinutes: 55,
        })}
      />,
    );

    expect(screen.getByText("55 min")).toBeTruthy();
    expect(screen.queryByText(/55.55/)).toBeNull();
  });

  it("keeps a genuine Arrive-By range as a real range (55-63 min)", () => {
    render(
      <JourneyDuration
        state={durationState({
          predictionStatus: "available",
          baselineDurationMinutes: 43,
          lowerBoundMinutes: 55,
          upperBoundMinutes: 63,
        })}
      />,
    );

    expect(screen.getByText("55 min–1 hr 03 min")).toBeTruthy();
  });

  it("formats an hour-plus range correctly", () => {
    render(
      <JourneyDuration
        state={durationState({
          predictionStatus: "available",
          baselineDurationMinutes: 55,
          lowerBoundMinutes: 65,
          upperBoundMinutes: 78,
        })}
      />,
    );

    // Exact separator/format is owned by lib/duration/format.ts — just confirm
    // hour-scale values render as hours, not raw 65-78 minute numbers.
    expect(screen.getByText(/1 hr/)).toBeTruthy();
  });

  it("notes that a route-disrupted range excludes the disruption", () => {
    render(
      <JourneyDuration
        state={durationState({
          predictionStatus: "route-disrupted",
          baselineDurationMinutes: 43,
          lowerBoundMinutes: 43,
          upperBoundMinutes: 50,
        })}
      />,
    );

    expect(screen.getByText(/doesn.t account for the itinerary disruption/)).toBeTruthy();
  });

  it("renders nothing before the duration model has resolved", () => {
    const { container } = render(<JourneyDuration state={null} />);
    expect(container.textContent).toBe("");
  });
});

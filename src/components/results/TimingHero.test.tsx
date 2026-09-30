// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { formatTripTime } from "@/lib/trip/format";
import { TimingHero } from "./TimingHero";
import { timingState } from "./fixtures";

afterEach(cleanup);

describe("TimingHero", () => {
  it("shows a dominant Leave By time for an available Arrive-By recommendation", () => {
    const targetArrivalTime = new Date("2026-09-24T16:00:00Z");
    const recommendedDepartureTime = new Date("2026-09-24T15:20:00Z");

    render(
      <TimingHero
        state={timingState({
          preference: "arriveBy",
          status: "available",
          arriveBy: {
            targetArrivalTime,
            typicalDepartureTime: new Date("2026-09-24T15:15:00Z"),
            recommendedDepartureTime,
            leaveEarlierByMinutes: 5,
          },
        })}
      />,
    );

    expect(screen.getByText("Leave by")).toBeTruthy();
    expect(screen.getByText(formatTripTime(recommendedDepartureTime))).toBeTruthy();
    expect(screen.getByText(/~5 min earlier than typical/)).toBeTruthy();
    expect(screen.getByText(new RegExp(`Arrive by ${formatTripTime(targetArrivalTime)}`))).toBeTruthy();
  });

  it("shows an expected arrival range for an available Leave-At recommendation", () => {
    const selectedDepartureTime = new Date("2026-09-24T15:00:00Z");
    const expectedArrivalLower = new Date("2026-09-24T15:40:00Z");
    const expectedArrivalUpper = new Date("2026-09-24T15:48:00Z");

    render(
      <TimingHero
        state={timingState({
          preference: "leaveAt",
          status: "available",
          leaveAt: {
            selectedDepartureTime,
            typicalArrivalTime: new Date("2026-09-24T15:43:00Z"),
            expectedArrivalLower,
            expectedArrivalUpper,
          },
        })}
      />,
    );

    expect(screen.getByText("Leave at")).toBeTruthy();
    expect(screen.getByText("Expected arrival")).toBeTruthy();
    expect(
      screen.getByText(`${formatTripTime(expectedArrivalLower)}–${formatTripTime(expectedArrivalUpper)}`),
    ).toBeTruthy();
  });

  it("collapses an identical expected-arrival lower/upper bound to a single time, not '10:14-10:14'", () => {
    const arrival = new Date("2026-09-24T17:14:00Z");

    render(
      <TimingHero
        state={timingState({
          preference: "leaveAt",
          status: "available",
          leaveAt: {
            selectedDepartureTime: new Date("2026-09-24T17:00:00Z"),
            typicalArrivalTime: arrival,
            expectedArrivalLower: arrival,
            expectedArrivalUpper: arrival,
            arrivalDifferenceFromTypicalMinutes: { lower: 0, upper: 0 },
          },
        })}
      />,
    );

    const expectedLabel = formatTripTime(arrival);
    expect(screen.getByText(expectedLabel)).toBeTruthy();
    expect(screen.queryByText(new RegExp(`${expectedLabel}.${expectedLabel}`))).toBeNull();
  });

  it("does not redundantly repeat an identical typical arrival — shows a plain no-delay note instead", () => {
    const arrival = new Date("2026-09-24T17:14:00Z");

    render(
      <TimingHero
        state={timingState({
          preference: "leaveAt",
          status: "available",
          leaveAt: {
            selectedDepartureTime: new Date("2026-09-24T17:00:00Z"),
            typicalArrivalTime: arrival,
            expectedArrivalLower: arrival,
            expectedArrivalUpper: arrival,
            arrivalDifferenceFromTypicalMinutes: { lower: 0, upper: 0 },
          },
        })}
      />,
    );

    expect(screen.getByText("No additional delay currently expected")).toBeTruthy();
    expect(screen.queryByText(/Typical arrival/)).toBeNull();
  });

  it("shows the typical arrival and additional-time comparison when the expected arrival genuinely differs", () => {
    render(
      <TimingHero
        state={timingState({
          preference: "leaveAt",
          status: "available",
          leaveAt: {
            selectedDepartureTime: new Date("2026-09-24T17:00:00Z"),
            typicalArrivalTime: new Date("2026-09-24T17:14:00Z"),
            expectedArrivalLower: new Date("2026-09-24T17:26:00Z"),
            expectedArrivalUpper: new Date("2026-09-24T17:31:00Z"),
            arrivalDifferenceFromTypicalMinutes: { lower: 12, upper: 17 },
          },
        })}
      />,
    );

    expect(screen.getByText(/Typical arrival/)).toBeTruthy();
    expect(screen.getByText(/Expected additional time \+12 to \+17 min/)).toBeTruthy();
    expect(screen.queryByText("No additional delay currently expected")).toBeNull();
  });

  it("never manufactures a recommendation when the itinerary is disrupted", () => {
    render(
      <TimingHero
        state={timingState({
          status: "route-disrupted",
          statusReasons: ["Your transit connection has been canceled."],
        })}
      />,
    );

    expect(screen.getByText("Current itinerary disrupted")).toBeTruthy();
    expect(screen.queryByText("Leave by")).toBeNull();
    expect(screen.queryByText(/Leave by \d/)).toBeNull();
  });

  it("shows an unavailable notice, not a fake time, when data is insufficient", () => {
    render(
      <TimingHero
        state={timingState({ status: "insufficient-data", statusReasons: ["No traffic or transit data available."] })}
      />,
    );

    expect(screen.getByText("Expected commute unavailable")).toBeTruthy();
    expect(screen.getByText("No traffic or transit data available.")).toBeTruthy();
  });

  it("departure-window-missed: shows a fresh 'if you leave now' arrival, not a stale past Leave By time", () => {
    const lower = new Date("2026-09-24T16:10:00Z");
    const upper = new Date("2026-09-24T16:18:00Z");

    render(
      <TimingHero
        state={timingState({
          status: "departure-window-missed",
          preference: "arriveBy",
          arriveBy: {
            targetArrivalTime: new Date("2026-09-24T16:00:00Z"),
            leaveNowExpectedArrivalRange: { lower, central: lower, upper },
          },
        })}
      />,
    );

    expect(screen.getByText("Recommended departure window has passed")).toBeTruthy();
    expect(screen.getByText(new RegExp(`${formatTripTime(lower)}.${formatTripTime(upper)}`))).toBeTruthy();
  });

  it("departure-window-missed: recommends rechecking with Leave At: Now when the analysis is stale", () => {
    render(
      <TimingHero
        state={timingState({
          status: "departure-window-missed",
          preference: "arriveBy",
          arriveBy: {
            targetArrivalTime: new Date("2026-09-24T16:00:00Z"),
            leaveNowAnalysisStale: true,
          },
        })}
      />,
    );

    expect(screen.getByText(/recheck using Leave At: Now/)).toBeTruthy();
  });

  it("labels a Leave By time that falls on the previous calendar day", () => {
    // A full day apart in UTC guarantees different America/Vancouver calendar dates
    // regardless of the test runner's own local timezone.
    const recommendedDepartureTime = new Date("2026-09-23T23:30:00Z");
    const targetArrivalTime = new Date("2026-09-24T23:30:00Z");

    render(
      <TimingHero
        state={timingState({
          preference: "arriveBy",
          status: "available",
          arriveBy: { targetArrivalTime, recommendedDepartureTime },
        })}
      />,
    );

    expect(
      screen.getByText(new RegExp(`${formatTripTime(recommendedDepartureTime)} \\(previous day\\)`)),
    ).toBeTruthy();
  });

  it("limited-data: still shows the recommendation, plus an unobtrusive limited-data note", () => {
    render(
      <TimingHero
        state={timingState({
          preference: "arriveBy",
          status: "limited-data",
          statusReasons: ["Traffic data was unavailable for this trip."],
          arriveBy: {
            targetArrivalTime: new Date("2026-09-24T16:00:00Z"),
            recommendedDepartureTime: new Date("2026-09-24T15:20:00Z"),
          },
        })}
      />,
    );

    expect(screen.getByText("Leave by")).toBeTruthy();
    expect(screen.getByText(/Based on limited data/)).toBeTruthy();
    expect(screen.getByText(/Traffic data was unavailable for this trip\./)).toBeTruthy();
  });

  it("renders nothing before the timing model has resolved", () => {
    const { container } = render(<TimingHero state={null} />);
    expect(container.textContent).toBe("");
  });
});

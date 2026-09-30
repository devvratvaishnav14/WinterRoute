// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { WhySection } from "./WhySection";
import { durationState, forecast, route, segment, timingState, weatherAnalysis, weatherSample } from "./fixtures";

afterEach(cleanup);

describe("WhySection", () => {
  it("uses 'At a glance' and a neutral restatement when nothing meaningful is different", () => {
    render(
      <WhySection
        timingState={timingState({
          status: "available",
          summarySentences: ["Based on current conditions, you're expected to arrive around 10:14 AM."],
          explanation: [],
        })}
        durationState={durationState()}
        weatherState={null}
        route={null}
      />,
    );

    expect(screen.getByText("At a glance")).toBeTruthy();
    expect(screen.getByText(/expected to arrive around 10:14 AM/)).toBeTruthy();
    expect(screen.getByText(/No significant disruption is currently affecting this trip\./)).toBeTruthy();
    expect(screen.queryByText("Why this commute is different")).toBeNull();
  });

  it("uses 'Why this commute is different' and lists only genuine reasons when they exist", () => {
    render(
      <WhySection
        timingState={timingState({
          status: "available",
          summarySentences: ["Based on current conditions, you're expected to arrive between 10:22 and 10:28 AM."],
          explanation: [
            "Google's traffic-aware routing currently adds about 8 min compared with the reference duration.",
            "Rain is forecast along part of the route.",
          ],
        })}
        durationState={durationState()}
        weatherState={null}
        route={null}
      />,
    );

    expect(screen.getByText("Why this commute is different")).toBeTruthy();
    expect(screen.getByText(/currently adds about 8 min/)).toBeTruthy();
    expect(screen.getByText(/Rain is forecast/)).toBeTruthy();
    // The factual restatement is already shown prominently in TimingHero — don't repeat it here.
    expect(screen.queryByText(/expected to arrive between/)).toBeNull();
    expect(screen.queryByText("At a glance")).toBeNull();
  });

  it("uses 'What to know' for an uncertainty-only note, and does not describe it as a delay", () => {
    render(
      <WhySection
        timingState={timingState({
          status: "available",
          summarySentences: ["Based on current conditions, you're expected to arrive around 10:14 AM."],
          explanation: [],
          notes: ["Bus 145 has no realtime update yet — the schedule is used as the best available estimate, with some allowance for the unconfirmed timing."],
        })}
        durationState={durationState()}
        weatherState={null}
        route={null}
      />,
    );

    expect(screen.getByText("What to know")).toBeTruthy();
    expect(screen.getByText(/Bus 145 has no realtime update yet/)).toBeTruthy();
    expect(screen.queryByText("Why this commute is different")).toBeNull();
    expect(screen.queryByText("At a glance")).toBeNull();
    expect(screen.queryByText(/delay/i)).toBeNull();
    expect(screen.queryByText(/late/i)).toBeNull();
  });

  it("prefers 'Why this commute is different' over 'What to know' when both a reason and a note exist", () => {
    render(
      <WhySection
        timingState={timingState({
          status: "available",
          summarySentences: [],
          explanation: ["Traffic is currently adding about 8 min compared with the reference duration."],
          notes: ["Bus 145 has no realtime update yet — the schedule is used as the best available estimate."],
        })}
        durationState={durationState()}
        weatherState={null}
        route={null}
      />,
    );

    expect(screen.getByText("Why this commute is different")).toBeTruthy();
    expect(screen.queryByText("What to know")).toBeNull();
  });

  it("never surfaces forecast-horizon wording in the normal Why section", () => {
    render(
      <WhySection
        timingState={timingState({
          status: "available",
          summarySentences: ["Based on current conditions, you're expected to arrive around 10:14 AM."],
          explanation: [],
        })}
        durationState={durationState()}
        weatherState={null}
        route={null}
      />,
    );

    expect(screen.queryByText(/hour/i)).toBeNull();
    expect(screen.queryByText(/forecast horizon/i)).toBeNull();
  });

  it("never outputs 'hour(s)' anywhere in its rendered text", () => {
    render(
      <WhySection
        timingState={timingState({
          status: "available",
          summarySentences: [],
          explanation: ["Traffic is currently adding about 8 minutes."],
        })}
        durationState={durationState()}
        weatherState={null}
        route={null}
      />,
    );

    expect(screen.queryByText(/hour\(s\)/)).toBeNull();
  });

  it("does not show a contradictory neutral summary when the itinerary is disrupted", () => {
    render(
      <WhySection
        timingState={timingState({
          status: "route-disrupted",
          summarySentences: [],
          explanation: [],
          statusReasons: ["A missed connection was detected."],
        })}
        durationState={durationState({ predictionStatus: "route-disrupted" })}
        weatherState={null}
        route={null}
      />,
    );

    expect(screen.queryByText("At a glance")).toBeNull();
    expect(screen.queryByText(/No significant disruption/)).toBeNull();
  });

  it("does not show a contradictory neutral summary when the departure window was missed", () => {
    render(
      <WhySection
        timingState={timingState({ status: "departure-window-missed", summarySentences: [], explanation: [] })}
        durationState={durationState()}
        weatherState={null}
        route={null}
      />,
    );

    expect(screen.queryByText("At a glance")).toBeNull();
  });

  it("renders nothing when there is nothing to say and no timing recommendation exists", () => {
    const { container } = render(
      <WhySection timingState={null} durationState={null} weatherState={null} route={null} />,
    );
    expect(container.textContent).toBe("");
  });

  it("uses 'What to know' for a low-disruption trip whose only genuinely-expected condition is uncertain rain", () => {
    const r = route([segment({ mode: "walk" })]);
    render(
      <WhySection
        timingState={timingState({
          status: "available",
          summarySentences: ["Based on current conditions, you're expected to arrive around 10:14 AM."],
          explanation: [],
        })}
        durationState={durationState()}
        weatherState={{
          status: "success",
          analysis: weatherAnalysis({ samples: [weatherSample(undefined, [forecast({ precipitationMm: 1, weatherCode: 61 })])] }),
        }}
        route={r}
      />,
    );

    expect(screen.getByText("What to know")).toBeTruthy();
    expect(screen.getByText(/light rain/i)).toBeTruthy();
    expect(screen.queryByText("Why this commute is different")).toBeNull();
    expect(screen.queryByText("At a glance")).toBeNull();
  });

  it("never leaks technical risk-model narrative ('Weather evidence...(N models)', 'No relevant road events were found') into the rendered section", () => {
    const r = route([segment({ mode: "walk" })]);
    render(
      <WhySection
        timingState={timingState({
          status: "available",
          summarySentences: ["Based on current conditions, you're expected to arrive around 10:14 AM."],
          explanation: [],
        })}
        durationState={durationState()}
        weatherState={{
          status: "success",
          analysis: weatherAnalysis({ samples: [weatherSample(undefined, [forecast({ precipitationMm: 1, weatherCode: 61 })])] }),
        }}
        route={r}
      />,
    );

    expect(screen.queryByText(/models\)/)).toBeNull();
    expect(screen.queryByText(/No relevant road events/)).toBeNull();
    expect(screen.queryByText(/Weather evidence/)).toBeNull();
  });
});

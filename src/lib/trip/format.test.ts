import { describe, expect, it } from "vitest";
import { TRANSPORT_MODE_LABELS, formatRelativeDayLabel, formatTimeRange, formatTripTime } from "./format";
import type { TransportMode } from "./types";

// Locale is pinned to "en-US" throughout so assertions don't depend on the
// locale of whatever machine runs the tests.

describe("formatTripTime", () => {
  it("formats a morning time", () => {
    expect(formatTripTime(new Date(2026, 0, 1, 7, 5), "en-US")).toBe("7:05 AM");
  });

  it("formats an afternoon time", () => {
    expect(formatTripTime(new Date(2026, 0, 1, 15, 30), "en-US")).toBe("3:30 PM");
  });

  it("pads single-digit minutes", () => {
    expect(formatTripTime(new Date(2026, 0, 1, 9, 4), "en-US")).toBe("9:04 AM");
  });
});

describe("formatTimeRange", () => {
  it("collapses to a single time when both bounds display the same minute", () => {
    const lower = new Date(2026, 0, 1, 10, 14, 0);
    const upper = new Date(2026, 0, 1, 10, 14, 45); // 45 seconds later, same displayed minute
    expect(formatTimeRange(lower, upper, "en-US")).toBe("10:14 AM");
  });

  it("shows a real range when the bounds display different minutes", () => {
    const lower = new Date(2026, 0, 1, 10, 22, 0);
    const upper = new Date(2026, 0, 1, 10, 28, 0);
    expect(formatTimeRange(lower, upper, "en-US")).toBe("10:22 AM–10:28 AM");
  });
});

describe("formatRelativeDayLabel", () => {
  const now = new Date(2026, 0, 1, 9, 0);

  it("labels the same calendar day as Today, regardless of time of day", () => {
    const laterToday = new Date(2026, 0, 1, 23, 59);
    expect(formatRelativeDayLabel(laterToday, now, "en-US")).toBe("Today");
  });

  it("labels the next calendar day as Tomorrow", () => {
    const tomorrow = new Date(2026, 0, 2, 0, 1);
    expect(formatRelativeDayLabel(tomorrow, now, "en-US")).toBe("Tomorrow");
  });

  it("falls back to a short weekday + date beyond tomorrow", () => {
    const in5Days = new Date(2026, 0, 6, 12, 0);
    const expected = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(in5Days);

    expect(formatRelativeDayLabel(in5Days, now, "en-US")).toBe(expected);
    expect(formatRelativeDayLabel(in5Days, now, "en-US")).not.toBe("Today");
    expect(formatRelativeDayLabel(in5Days, now, "en-US")).not.toBe("Tomorrow");
  });

  it("does not mistake a day boundary crossing for a full day difference", () => {
    // 11pm today vs 1am tomorrow are ~2 hours apart but different calendar days.
    const lateTonight = new Date(2026, 0, 1, 23, 0);
    const earlyTomorrow = new Date(2026, 0, 2, 1, 0);
    expect(formatRelativeDayLabel(earlyTomorrow, lateTonight, "en-US")).toBe("Tomorrow");
  });
});

describe("TRANSPORT_MODE_LABELS", () => {
  it("has a human-readable label for every transport mode", () => {
    const modes: TransportMode[] = ["walk", "car", "bus", "train", "cycle"];
    for (const mode of modes) {
      expect(TRANSPORT_MODE_LABELS[mode]).toBeTruthy();
    }
  });

  it("matches the expected display labels", () => {
    expect(TRANSPORT_MODE_LABELS).toEqual({
      walk: "Walk",
      car: "Car",
      bus: "Bus",
      train: "Train",
      cycle: "Cycle",
    });
  });
});

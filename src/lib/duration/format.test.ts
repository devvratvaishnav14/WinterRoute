import { describe, expect, it } from "vitest";
import { formatAdditionalTime, formatDurationMinutes, formatDurationRange, formatMinuteDifferenceRange } from "./format";

describe("formatDurationMinutes", () => {
  it("formats under an hour as plain minutes", () => {
    expect(formatDurationMinutes(43)).toBe("43 min");
  });

  it("formats an hour or more as 'hr min'", () => {
    expect(formatDurationMinutes(75)).toBe("1 hr 15 min");
  });

  it("rounds to the nearest whole minute, never showing decimals", () => {
    expect(formatDurationMinutes(57.3842)).toBe("57 min");
  });

  it("pads the minute remainder to two digits", () => {
    expect(formatDurationMinutes(62)).toBe("1 hr 02 min");
  });
});

describe("formatDurationRange", () => {
  it("formats a normal range", () => {
    expect(formatDurationRange(57, 65)).toBe("57 min–1 hr 05 min");
  });

  it("collapses to a single value when both bounds round the same", () => {
    expect(formatDurationRange(43.1, 43.4)).toBe("43 min");
  });

  it("never shows decimal minutes in a range", () => {
    expect(formatDurationRange(57.9, 64.1)).not.toMatch(/\./);
  });
});

describe("formatAdditionalTime", () => {
  it("shows a normal added-time range", () => {
    expect(formatAdditionalTime(43, 55, 63)).toBe("+12 to +20 min");
  });

  it("shows 'up to' when the lower bound equals baseline", () => {
    expect(formatAdditionalTime(43, 43, 63)).toBe("up to +20 min");
  });

  it("shows 'no added time expected' when the upper bound doesn't exceed baseline", () => {
    expect(formatAdditionalTime(43, 40, 43)).toBe("no added time expected");
  });

  it("shows a single value when lower and upper additional time are equal", () => {
    expect(formatAdditionalTime(43, 51, 51)).toBe("+8 min");
  });
});

describe("formatMinuteDifferenceRange", () => {
  it("shows a signed range for a genuine difference", () => {
    expect(formatMinuteDifferenceRange(12, 17)).toBe("+12 to +17 min");
  });

  it("collapses to a single signed value when both bounds are equal", () => {
    expect(formatMinuteDifferenceRange(8, 8)).toBe("+8 min");
  });

  it("does not clamp a genuinely negative (earlier-than-typical) difference to zero", () => {
    expect(formatMinuteDifferenceRange(-6, -3)).toBe("-6 to -3 min");
  });
});

import { describe, expect, it } from "vitest";
import { formatDelaySeconds } from "./format";

describe("formatDelaySeconds", () => {
  it("reports a positive delay as late", () => {
    expect(formatDelaySeconds(120)).toBe("+2 min late");
  });

  it("reports a negative delay as early", () => {
    expect(formatDelaySeconds(-90)).toBe("2 min early");
  });

  it("rounds a sub-minute value to 'On time'", () => {
    expect(formatDelaySeconds(20)).toBe("On time");
    expect(formatDelaySeconds(-20)).toBe("On time");
  });

  it("reports exactly zero as 'On time'", () => {
    expect(formatDelaySeconds(0)).toBe("On time");
  });
});

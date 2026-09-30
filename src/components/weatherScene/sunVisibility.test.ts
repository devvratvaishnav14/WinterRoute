import { describe, expect, it } from "vitest";
import { isMoonVisible, isSunVisible } from "./sunVisibility";

describe("isSunVisible — truth table", () => {
  it("clear day: sun visible", () => expect(isSunVisible("clear", "day")).toBe(true));
  it("mainly clear day: sun visible", () => expect(isSunVisible("mainly-clear", "day")).toBe(true));
  it("partly cloudy day: sun visible (though partially obscured by drifting cloud)", () => expect(isSunVisible("partly-cloudy", "day")).toBe(true));
  it("overcast: sun never visible", () => {
    expect(isSunVisible("overcast", "day")).toBe(false);
    expect(isSunVisible("overcast", "night")).toBe(false);
  });
  it("foggy: no strong visible sun", () => expect(isSunVisible("foggy", "day")).toBe(false));
  it("night: sun never visible regardless of sky", () => {
    expect(isSunVisible("clear", "night")).toBe(false);
    expect(isSunVisible("mainly-clear", "night")).toBe(false);
    expect(isSunVisible("partly-cloudy", "night")).toBe(false);
  });
});

describe("isMoonVisible", () => {
  it("clear/mainly-clear/partly-cloudy night: moon visible", () => {
    expect(isMoonVisible("clear", "night")).toBe(true);
    expect(isMoonVisible("mainly-clear", "night")).toBe(true);
    expect(isMoonVisible("partly-cloudy", "night")).toBe(true);
  });
  it("overcast/foggy night: no moon visible through thick cloud", () => {
    expect(isMoonVisible("overcast", "night")).toBe(false);
    expect(isMoonVisible("foggy", "night")).toBe(false);
  });
  it("day: moon never visible", () => {
    expect(isMoonVisible("clear", "day")).toBe(false);
  });
});

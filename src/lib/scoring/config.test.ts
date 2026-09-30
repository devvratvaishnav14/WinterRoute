import { describe, expect, it } from "vitest";
import { scoreOnCurve, scoreOnInverseCurve } from "./config";

describe("scoreOnCurve", () => {
  it("returns 0 at or below the low value", () => {
    expect(scoreOnCurve(0, { lowValue: 0, highValue: 10 })).toBe(0);
    expect(scoreOnCurve(-5, { lowValue: 0, highValue: 10 })).toBe(0);
  });

  it("returns 100 at or above the high value", () => {
    expect(scoreOnCurve(10, { lowValue: 0, highValue: 10 })).toBe(100);
    expect(scoreOnCurve(50, { lowValue: 0, highValue: 10 })).toBe(100);
  });

  it("interpolates linearly in between", () => {
    expect(scoreOnCurve(5, { lowValue: 0, highValue: 10 })).toBe(50);
  });

  it("is monotonically non-decreasing", () => {
    const curve = { lowValue: 0, highValue: 20 };
    const scores = [0, 2, 5, 10, 15, 20, 25].map((v) => scoreOnCurve(v, curve));
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]);
    }
  });

  it("has no discontinuity exactly at the low/high breakpoints (no off-by-one from < vs <=)", () => {
    const curve = { lowValue: 0, highValue: 15 };
    expect(scoreOnCurve(-0.001, curve)).toBe(0);
    expect(scoreOnCurve(0, curve)).toBe(0);
    expect(scoreOnCurve(0.001, curve)).toBeGreaterThan(0);
    expect(scoreOnCurve(14.999, curve)).toBeLessThan(100);
    expect(scoreOnCurve(15, curve)).toBe(100);
    expect(scoreOnCurve(15.001, curve)).toBe(100);
  });

  it("produces the exact expected value at the curve's midpoint", () => {
    expect(scoreOnCurve(10, { lowValue: 0, highValue: 20 })).toBe(50);
  });
});

describe("scoreOnInverseCurve", () => {
  it("returns 100 at or below the low value (worst case)", () => {
    expect(scoreOnInverseCurve(0, { lowValue: 1, highValue: 10 })).toBe(100);
  });

  it("returns 0 at or above the high value (best case)", () => {
    expect(scoreOnInverseCurve(10, { lowValue: 1, highValue: 10 })).toBe(0);
  });

  it("is monotonically non-increasing as the value grows", () => {
    const curve = { lowValue: 1, highValue: 10 };
    const scores = [0, 1, 3, 5, 8, 10, 15].map((v) => scoreOnInverseCurve(v, curve));
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
    }
  });
});

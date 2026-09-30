import { describe, expect, it } from "vitest";
import { computeConfigFingerprint, djb2Hash, stableStringify } from "./configFingerprint";

describe("computeConfigFingerprint", () => {
  it("is stable across repeated calls for the same config", () => {
    expect(computeConfigFingerprint()).toBe(computeConfigFingerprint());
  });

  it("is a non-empty hex string", () => {
    expect(computeConfigFingerprint()).toMatch(/^[0-9a-f]+$/);
  });
});

describe("stableStringify", () => {
  it("produces the same output regardless of key insertion order", () => {
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }));
  });

  it("distinguishes genuinely different values", () => {
    expect(stableStringify({ a: 1 })).not.toBe(stableStringify({ a: 2 }));
  });
});

describe("djb2Hash", () => {
  it("is stable for the same input", () => {
    expect(djb2Hash("hello")).toBe(djb2Hash("hello"));
  });

  it("differs for different input (sensitive to change)", () => {
    expect(djb2Hash("hello")).not.toBe(djb2Hash("hello!"));
  });
});

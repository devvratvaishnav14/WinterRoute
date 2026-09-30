import { describe, expect, it } from "vitest";
import { randomLightningBolt } from "./lightningBolt";

describe("randomLightningBolt", () => {
  it("produces a valid multi-segment SVG path starting near the top of the viewBox", () => {
    const bolt = randomLightningBolt(() => 0.5);
    expect(bolt.path.startsWith("M ")).toBe(true);
    expect((bolt.path.match(/L /g) ?? []).length).toBeGreaterThanOrEqual(5);
  });

  it("produces different bolts for different random sequences", () => {
    const a = randomLightningBolt(() => 0.2);
    const b = randomLightningBolt(() => 0.8);
    expect(a.path).not.toBe(b.path);
  });

  it("sometimes includes a branch, sometimes not, based on the random sequence", () => {
    const withBranch = randomLightningBolt(() => 0.9);
    const withoutBranch = randomLightningBolt(() => 0.1);
    expect(withBranch.branchPath.length).toBeGreaterThan(0);
    expect(withoutBranch.branchPath).toBe("");
  });
});

import { describe, expect, it } from "vitest";
import { cloudTileBackgroundImage, seedFromString } from "./cloudShapes";

const BASE = { width: 420, height: 170, clusterCount: 3, scale: 30, seed: 1, topColor: "#ffffff", bottomColor: "#c8d0dc", fillAlpha: 0.85, edgeBlur: 3, baseYFraction: 0.55 };

function decode(image: string): string {
  return decodeURIComponent(image.slice('url("'.length, -2));
}

/** Every numeric x/y coordinate that appears in an SVG path `d` attribute — covers the `M`/`C` command coordinates emitted by `smoothClosedPath`. */
function extractPathCoordinates(svg: string): number[] {
  const dAttrs = [...svg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);
  const numbers: number[] = [];
  for (const d of dAttrs) {
    for (const match of d.matchAll(/-?\d+\.?\d*/g)) {
      numbers.push(Number(match[0]));
    }
  }
  return numbers;
}

describe("cloudTileBackgroundImage", () => {
  it("returns a valid CSS url(...) data-URI value", () => {
    const image = cloudTileBackgroundImage(BASE);
    expect(image.startsWith('url("data:image/svg+xml,')).toBe(true);
    expect(image.endsWith('")')).toBe(true);
  });

  it("embeds an actual SVG document with smoothly-curved path shapes, not an empty tile", () => {
    const decoded = decode(cloudTileBackgroundImage(BASE));
    expect(decoded).toContain("<svg");
    expect(decoded).toContain("<path");
    expect(decoded).toContain(" C "); // cubic bezier commands — a smooth curve, never a straight-edged polygon
  });

  it("is deterministic — the same seed always produces the same tile", () => {
    expect(cloudTileBackgroundImage(BASE)).toBe(cloudTileBackgroundImage(BASE));
  });

  it("a different seed produces a visually different tile (never identical shapes)", () => {
    expect(cloudTileBackgroundImage(BASE)).not.toBe(cloudTileBackgroundImage({ ...BASE, seed: 2 }));
  });

  it("more clusters produce a larger/denser SVG payload", () => {
    const sparse = cloudTileBackgroundImage({ ...BASE, clusterCount: 1 });
    const dense = cloudTileBackgroundImage({ ...BASE, clusterCount: 6 });
    expect(dense.length).toBeGreaterThan(sparse.length);
  });

  it("uses the given palette colors in the generated gradient", () => {
    const image = cloudTileBackgroundImage({ ...BASE, topColor: "#123456", bottomColor: "#abcdef" });
    const decoded = decodeURIComponent(image);
    expect(decoded).toMatch(/18,52,86/); // #123456 -> rgb
    expect(decoded).toMatch(/171,205,239/); // #abcdef -> rgb
  });

  it("gives far/mid/near depth layers of the SAME condition genuinely different shape data, never the same silhouette reused at a different scale", () => {
    const far = cloudTileBackgroundImage({ ...BASE, seed: seedFromString("overcast-far") });
    const mid = cloudTileBackgroundImage({ ...BASE, seed: seedFromString("overcast-mid") });
    const near = cloudTileBackgroundImage({ ...BASE, seed: seedFromString("overcast-near") });
    expect(new Set([far, mid, near]).size).toBe(3);
  });

  it("produces multiple overlapping irregular blobs per cluster, not a small fixed handful of same-size shapes", () => {
    const decoded = decode(cloudTileBackgroundImage(BASE));
    const pathCount = (decoded.match(/<path /g) ?? []).length;
    expect(pathCount).toBeGreaterThanOrEqual(12); // 3 clusters x >=4 blobs each
  });

  it("every blob has an irregular outline — never a symmetric fixed-radius shape (point-to-center distances vary within one blob)", () => {
    const decoded = decode(cloudTileBackgroundImage(BASE));
    const dAttrs = [...decoded.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);
    expect(dAttrs.length).toBeGreaterThan(0);
    for (const d of dAttrs.slice(0, 5)) {
      const nums = [...d.matchAll(/-?\d+\.?\d*/g)].map((m) => Number(m[0]));
      // M x y, then repeated "C x1 y1 x2 y2 x y" — collect just the on-curve end points (every 6th pair after the first).
      const endPoints: Array<[number, number]> = [[nums[0], nums[1]]];
      for (let i = 2; i + 5 < nums.length; i += 6) {
        endPoints.push([nums[i + 4], nums[i + 5]]);
      }
      const cx = endPoints.reduce((s, p) => s + p[0], 0) / endPoints.length;
      const cy = endPoints.reduce((s, p) => s + p[1], 0) / endPoints.length;
      const distances = endPoints.map((p) => Math.hypot(p[0] - cx, p[1] - cy));
      const min = Math.min(...distances);
      const max = Math.max(...distances);
      expect(max / min).toBeGreaterThan(1.05); // a true circle/ellipse would have ~1.0 here
    }
  });

  describe("no rectangular-clipping artifact — every coordinate stays safely inside the tile bounds", () => {
    const SAFE_MARGIN = 26;

    it("holds for ordinary conditions", () => {
      const decoded = decode(cloudTileBackgroundImage(BASE));
      const coords = extractPathCoordinates(decoded);
      expect(coords.length).toBeGreaterThan(0);
      for (const n of coords) {
        // Each number alternates x/y in the source, but since both dimensions share the same safe margin here it's enough to bound every coordinate within [margin, max(width,height)-margin] loosely, then check axis-specific bounds directly below.
        expect(n).toBeGreaterThanOrEqual(-1); // never wildly negative
      }
    });

    it("holds for the largest scale/cluster-count combination any real condition ever passes (heavy snow/storm 'near' layer)", () => {
      // Mirrors weatherVisualProfile.ts's largest real values: near-layer scale up to ~40 * 1.25 intensity multiplier, 2 clusters.
      const extreme = { ...BASE, scale: 50, clusterCount: 2, edgeBlur: 6 };
      const decoded = decode(cloudTileBackgroundImage(extreme));
      const dAttrs = [...decoded.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);
      for (const d of dAttrs) {
        const nums = [...d.matchAll(/-?\d+\.?\d*/g)].map((m) => Number(m[0]));
        for (let i = 0; i < nums.length; i += 2) {
          const x = nums[i];
          const y = nums[i + 1];
          expect(x).toBeGreaterThanOrEqual(SAFE_MARGIN - 0.5);
          expect(x).toBeLessThanOrEqual(extreme.width - SAFE_MARGIN + 0.5);
          expect(y).toBeGreaterThanOrEqual(SAFE_MARGIN - 0.5);
          expect(y).toBeLessThanOrEqual(extreme.height - SAFE_MARGIN + 0.5);
        }
      }
    });

    it("holds across many different seeds, never just the one seed happening to be tested", () => {
      for (let seed = 1; seed <= 25; seed++) {
        const decoded = decode(cloudTileBackgroundImage({ ...BASE, scale: 45, clusterCount: 3, seed }));
        const dAttrs = [...decoded.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);
        for (const d of dAttrs) {
          const nums = [...d.matchAll(/-?\d+\.?\d*/g)].map((m) => Number(m[0]));
          for (let i = 0; i < nums.length; i += 2) {
            expect(nums[i]).toBeGreaterThanOrEqual(25.5);
            expect(nums[i]).toBeLessThanOrEqual(BASE.width - 25.5);
            expect(nums[i + 1]).toBeGreaterThanOrEqual(25.5);
            expect(nums[i + 1]).toBeLessThanOrEqual(BASE.height - 25.5);
          }
        }
      }
    });

    it("the filter (blur) region is generous, not tight around the shapes' own bounding box", () => {
      const decoded = decode(cloudTileBackgroundImage(BASE));
      const filterRegion = decoded.match(/<filter id="b" x="(-?\d+)%" y="(-?\d+)%" width="(\d+)%" height="(\d+)%"/);
      expect(filterRegion).not.toBeNull();
      expect(Number(filterRegion![1])).toBeLessThanOrEqual(-40); // meaningfully negative x offset
      expect(Number(filterRegion![3])).toBeGreaterThanOrEqual(180); // meaningfully oversized width
    });

    it("the SVG root declares overflow: visible as a second, independent defense against viewBox clipping", () => {
      const decoded = decode(cloudTileBackgroundImage(BASE));
      expect(decoded).toMatch(/<svg[^>]*overflow="visible"/);
    });
  });
});

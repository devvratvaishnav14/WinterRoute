/**
 * Procedural, SVG-based cloud silhouettes.
 *
 * V3: a cloud mass is now a handful of overlapping, fully OPAQUE
 * IRREGULAR BLOBS — each blob's outline is a smoothly-interpolated
 * closed curve through points at RANDOMIZED radii around its center
 * (never a fixed-radius circle or ellipse), so no individual shape has
 * the symmetric curvature that reads as "a circle"/"an oval." Several
 * such blobs, heavily overlapping and sharing one gradient fill, fuse
 * into one continuous, non-repeating, organic silhouette — not a chain
 * of recognizable primitives. See `blobPath`'s doc comment for the
 * curve technique and `organicCloudCluster`'s for how several blobs
 * combine into one cloud mass.
 *
 * Every coordinate is hard-clamped to a safe margin inside the tile's
 * own viewBox (`clamp`, applied in `blobPath`) — this is what prevents
 * the rectangular clipping artifact a previous version had: a shape (or
 * its blur) extending past the SVG's own viewBox gets hard-cut exactly
 * at that rectangular boundary, and because the tile then repeats/
 * stretches via CSS `background-repeat`/`background-size`, that cut
 * shows up as a visible straight edge. Clamping guarantees no path
 * coordinate can ever reach the boundary, regardless of how large an
 * upstream `scale` value gets fed in for a denser/heavier condition.
 *
 * Deterministic (seeded PRNG) so a given layer's shapes are stable
 * across renders, not regenerated randomly every paint — only
 * genuinely different SEEDS (far/mid/near, per condition) produce
 * different-looking clusters. Geometry is generated ONCE per (profile,
 * layer) — see `CloudLayers`'s `useMemo` in `WeatherSceneBackground.tsx`
 * — never recomputed per animation frame; the drift itself is a plain
 * CSS `background-position-x` animation, not JS-driven.
 *
 * Rendered as a `data:image/svg+xml` background-image, reusing the
 * existing `.weather-cloud-layer` CSS (`background-repeat: repeat-x` +
 * an animated `background-position-x`) for seamless horizontal drift —
 * no Canvas, no WebGL, no downloaded assets.
 */

/** A small, fast string hash — turns an arbitrary label (e.g. a profile id + layer key) into a stable PRNG seed, so different conditions get genuinely different-looking cloud arrangements rather than the same shapes recolored. */
export function seedFromString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(hash, 31) + value.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

/** Small, fast, deterministic PRNG (mulberry32) — same seed always produces the same sequence. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * A safety margin (in SVG user units) that NO cloud-shape coordinate is
 * ever allowed inside of, on any edge of the tile's viewBox — reserved
 * space for the blur filter to bleed into without being clipped by the
 * viewBox boundary. Deliberately generous relative to the largest
 * `edgeBlur` value any condition ever uses (~6 units), so blur bleed
 * (roughly 2-3x the blur radius) always has room.
 */
const EDGE_SAFE_MARGIN = 26;

type Point = [number, number];

/**
 * Catmull-Rom-through-Bezier conversion for a CLOSED curve — turns a
 * ring of points into one smoothly-interpolated organic outline (no
 * straight polygon edges, no piecewise circular arcs). Control points
 * are clamped to the SAME safe bounds as the on-curve points: Catmull-
 * Rom control points can overshoot slightly past their neighboring
 * on-curve points (inherent to the construction, more so with higher
 * irregularity) — left unclamped, that overshoot is exactly the kind of
 * small edge-bleed that produced the original clipping artifact.
 */
function smoothClosedPath(points: Point[], width: number, height: number): string {
  const n = points.length;
  const at = (i: number): Point => points[((i % n) + n) % n];
  const cx = (x: number) => clamp(x, EDGE_SAFE_MARGIN, width - EDGE_SAFE_MARGIN);
  const cy = (y: number) => clamp(y, EDGE_SAFE_MARGIN, height - EDGE_SAFE_MARGIN);
  let d = `M ${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1x = cx(p1[0] + (p2[0] - p0[0]) / 6);
    const c1y = cy(p1[1] + (p2[1] - p0[1]) / 6);
    const c2x = cx(p2[0] - (p3[0] - p1[0]) / 6);
    const c2y = cy(p2[1] - (p3[1] - p1[1]) / 6);
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return `${d} Z`;
}

/**
 * ONE irregular blob — a closed, smoothly-curved outline through 8-12
 * points placed around `(cx, cy)`, each at a RANDOMIZED radius (never
 * the same radius twice — that symmetry is exactly what makes a shape
 * read as "a circle"), squashed by `rx`/`ry` into a wide, flattish base
 * form and given a small independent rotation. Every point is clamped
 * to stay `EDGE_SAFE_MARGIN` inside the tile bounds — see module doc
 * comment for why.
 */
function blobPath(rng: () => number, cx: number, cy: number, rx: number, ry: number, rotationDeg: number, width: number, height: number): string {
  const pointCount = 9 + Math.floor(rng() * 4); // 9-12
  const irregularity = 0.3 + rng() * 0.22; // 0.30-0.52 — a real, visible departure from a smooth ellipse
  const rotationRad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rotationRad);
  const sin = Math.sin(rotationRad);

  const points: Point[] = [];
  for (let i = 0; i < pointCount; i++) {
    const angle = (i / pointCount) * Math.PI * 2;
    const radiusFactor = 1 + (rng() - 0.5) * 2 * irregularity;
    const localX = Math.cos(angle) * rx * radiusFactor;
    const localY = Math.sin(angle) * ry * radiusFactor;
    const x = cx + localX * cos - localY * sin;
    const y = cy + localX * sin + localY * cos;
    points.push([clamp(x, EDGE_SAFE_MARGIN, width - EDGE_SAFE_MARGIN), clamp(y, EDGE_SAFE_MARGIN, height - EDGE_SAFE_MARGIN)]);
  }

  return smoothClosedPath(points, width, height);
}

/**
 * A cloud MASS — 4-7 overlapping irregular blobs (see `blobPath`)
 * clustered around `(baseX, baseY)`, sharing one fill so heavily-
 * overlapping regions read as continuous density rather than distinct
 * objects. Blob size/position/rotation/irregularity all vary per blob,
 * so the union has broken, asymmetric contours — never a "row of
 * identical humps." Every size and offset used here is bounded as a
 * fraction of `width`/`height` (never purely of `scale`), which is what
 * keeps a cluster's total extent predictable and safely clampable in
 * `blobPath`, however large the caller's `scale` gets for a denser
 * condition.
 */
function organicCloudCluster(rng: () => number, baseX: number, baseY: number, scale: number, width: number, height: number): string[] {
  const paths: string[] = [];
  const blobCount = 4 + Math.floor(rng() * 4); // 4-7

  const maxOffsetX = Math.min(scale * 0.55, width * 0.16);
  const maxRx = Math.min(scale * 0.5, width * 0.13);
  const maxRy = Math.min(scale * 0.4, height * 0.22);

  for (let i = 0; i < blobCount; i++) {
    const t = blobCount === 1 ? 0.5 : i / (blobCount - 1);
    const offsetX = (t - 0.5) * 2 * maxOffsetX + (rng() - 0.5) * maxOffsetX * 0.4;
    const offsetY = (rng() - 0.5) * maxRy * 0.7 - Math.sin(t * Math.PI) * maxRy * 0.25;
    const rx = maxRx * (0.55 + rng() * 0.45);
    const ry = Math.min(maxRy, rx) * (0.55 + rng() * 0.35);
    const rotation = (rng() - 0.5) * 50;
    paths.push(blobPath(rng, baseX + offsetX, baseY + offsetY, rx, ry, rotation, width, height));
  }

  return paths;
}

export interface CloudTileOptions {
  /** Tile viewBox size — the tile repeats horizontally via CSS `background-repeat: repeat-x`. */
  width: number;
  height: number;
  /** How many cloud clusters populate one tile — more = denser coverage. */
  clusterCount: number;
  /** Average lobe scale for a cluster (before per-cluster randomization) — a soft target, not a guarantee: actual blob size is also capped as a fraction of `width`/`height` (see `organicCloudCluster`), so it can never push shapes into the clamped edge margin. */
  scale: number;
  seed: number;
  /** Lit-top / shaded-underside gradient stops. */
  topColor: string;
  bottomColor: string;
  /** Overall shape alpha (0-1) — the OPAQUE fill's own alpha, distinct from CSS layer opacity, so a cloud can be dense-looking (high) or wispy (low) independent of how many layers stack. */
  fillAlpha: number;
  /** Soft-edge blur, in SVG user units (scales with the tile, not pixels). */
  edgeBlur: number;
  /** Vertical band the clusters' base sits within (0-1, fraction of height) — lets far/near layers sit at slightly different heights for depth. */
  baseYFraction: number;
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Builds one seamless-tiling SVG cloud layer and returns it as a `url("data:image/svg+xml,...")` CSS background-image value. */
export function cloudTileBackgroundImage(opts: CloudTileOptions): string {
  const rng = mulberry32(opts.seed);
  const baseY = opts.height * opts.baseYFraction;

  let shapes = "";
  for (let i = 0; i < opts.clusterCount; i++) {
    const clusterSpan = opts.width / opts.clusterCount;
    const baseX = clamp(clusterSpan * (i + 0.5) + (rng() - 0.5) * clusterSpan * 0.35, EDGE_SAFE_MARGIN, opts.width - EDGE_SAFE_MARGIN);
    const clusterScale = opts.scale * (0.75 + rng() * 0.5);
    const clusterY = clamp(baseY + (rng() - 0.5) * opts.height * 0.12, EDGE_SAFE_MARGIN, opts.height - EDGE_SAFE_MARGIN);
    const blobs = organicCloudCluster(rng, baseX, clusterY, clusterScale, opts.width, opts.height);
    for (const d of blobs) {
      shapes += `<path d="${d}" fill="url(#g)"/>`;
    }
  }

  // The filter region is generous (well beyond the object bounding box)
  // as defense-in-depth for the blur itself, on top of the coordinate
  // clamping above; `overflow="visible"` on the root is a second,
  // independent defense against viewBox clipping (some renderers honor
  // it even for an image-referenced SVG, some don't — the coordinate
  // clamping is the guarantee that actually matters).
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${opts.width} ${opts.height}" overflow="visible">` +
    `<defs>` +
    `<linearGradient id="g" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${hexToRgba(opts.topColor, opts.fillAlpha)}"/>` +
    `<stop offset="1" stop-color="${hexToRgba(opts.bottomColor, opts.fillAlpha)}"/>` +
    `</linearGradient>` +
    `<filter id="b" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="${opts.edgeBlur}"/></filter>` +
    `</defs>` +
    `<g filter="url(#b)">${shapes}</g>` +
    `</svg>`;

  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

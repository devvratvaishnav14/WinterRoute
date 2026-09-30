# 0015 — Cloud renderer V3: organic blob paths, and the rectangle-clipping fix

**Date:** 2026-09-29

## Context

After two prior passes (0013's translucent radial-gradient blobs,
0014's flattened/rotated ellipse clusters), manual inspection still
found the clouds reading as "circles/bubbles joined together," plus a
newly-reported visible rectangular artifact inside the cloud layer.
Full mechanism detail lives in `docs/architecture.md`'s "Cloud shape —
procedural SVG, not CSS gradients (V3)" and "The rectangular-clipping
artifact and its fix." No analytical/provider/scoring/timing/duration/
transit/route/Preview-My-Commute logic changed — this stage touched
only `components/weatherScene/cloudShapes.ts`, its test file, and
`WeatherSceneBackground.tsx`'s tile-size constant.

## Decisions

- **Replace ellipses with irregular blob paths, not another ellipse
  variant.** An ellipse — however flattened or rotated — has smooth,
  symmetric curvature by construction, which is precisely what makes it
  read as "a shape" (a circle or oval) rather than organic cloud
  texture. A blob whose outline is a smooth curve through points at a
  RANDOMIZED radius per angle has no such symmetry, so it doesn't read
  as a primitive even before considering overlap with other blobs.
- **Catmull-Rom-to-Bezier for the outline, not a polygon.** A closed
  polygon through randomized points would look jagged/faceted; a
  Catmull-Rom spline converted to cubic Bezier segments gives a smooth
  but still irregular curve — soft edges without becoming an
  undefined grey smear.
- **The rectangle bug's root cause was geometry that could exceed its
  own tile bounds, not a missing overlay.** The user's own instructions
  explicitly forbade "fixing" it by adding more blur or another cover
  layer — correctly, since that would only mask the symptom. Traced to
  the V2 ellipse generator's fringe-lobe offset formula, which scaled
  with the caller's `scale` value unbounded — for a "near" layer at
  heavy-snow/storm intensity, a lobe could land ~130 units from its
  cluster center, well past a 300-unit-wide viewBox. Content past an
  SVG's own viewBox is hard-clipped there; tiling/stretching that via
  CSS turns the clip into a repeating rectangle.
- **Fixed by bounding geometry as a fraction of the tile, plus hard
  coordinate clamping — not by guessing safer multipliers.** Blob size/
  offset are now capped as a fraction of the tile's `width`/`height`
  (so an unusually large `scale` can no longer push shapes toward the
  edge), and every final coordinate — INCLUDING Bezier control points,
  which can overshoot their on-curve neighbors by a small amount
  through the Catmull-Rom construction itself — is clamped to stay a
  fixed safe margin inside the bounds. The clamping is the actual
  guarantee (verified by a test sweeping 25 seeds at the largest
  scale/cluster-count combination any real condition produces); the
  enlarged tile, generous filter region, and `overflow="visible"` are
  deliberate additional defenses, not relied on alone.
- **Geometry generation stays one-time, not per-frame.** All of this
  runs once per `(profile, layer)` inside `CloudLayers`'s existing
  `useMemo` — the added irregularity/clamping math is negligible cost
  paid once per scene change, never during the CSS-driven drift
  animation itself.

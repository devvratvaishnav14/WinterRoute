# 0014 — Weather visual renderer rebuild

**Date:** 2026-09-29

## Context

After manually inspecting every Weather Scene Lab preset introduced in
0013, the visual quality bar was not met: clouds read as faint blurry
blobs rather than recognizable cloud masses; drizzle/light/moderate/
heavy rain were barely distinguishable from each other, as were light/
moderate/heavy snow; the clear-day sun looked like a lit 3D sphere
(effectively a yellow moon); thunderstorm was mostly a purple tint plus
a screen flash. This was assessed as an architecture problem, not a
tuning problem — the previous cloud technique (semi-transparent radial-
gradient blob stacks) is translucent EVERYWHERE, so no amount of
opacity tuning could make it read as a solid, recognizable form. This
records the decisions behind the rebuild. Full mechanism detail lives
in `docs/architecture.md` "Rendering (V2)"; the `WeatherSceneDescriptor`
DATA contract (`condition`/`intensity`/`sky`/`precipitationType`/
`lightning`/`dayPhase`/`dataStatus`, from 0013) and
`resolveWeatherScene.ts`'s resolution logic are UNCHANGED — this stage
touched only `components/weatherScene/*` and `globals.css`.

## Decisions

- **A single centralized `WeatherVisualProfile` matrix, not per-renderer
  re-derivation.** `weatherVisualProfile.ts`'s `visualProfileFor()` is
  now the ONE function every render surface (sky palette, cloud recipe,
  precipitation particle profile, haze, fog bands, sun/moon visibility,
  lightning) reads its parameters from — replacing the previous design
  where `sceneVisuals.ts` (sky palette) and `skyLayers.ts` (cloud
  recipe) independently mapped the same `condition` to their own
  buckets. One function, one switch statement, one place to verify "do
  these pieces agree with each other" — rather than trusting two
  parallel lookup tables to stay in sync by convention.
- **Keyed primarily on `condition`, not the coarser `sky`+
  `precipitationType`+`intensity` triple from 0013's renderer.** That
  triple cannot distinguish "drizzle" from "light rain" (both would
  collapse to `precipitationType: "rain", intensity: "light"`) even
  though `condition` already has them as separate enum values. Reverting
  to `condition` as the primary key — with `intensity` selecting a
  sub-tier WITHIN a condition family, `sky` distinguishing snow showers
  from ordinary snow, and `precipitationType`+`lightning` distinguishing
  dry vs. wet thunderstorm — is what makes every one of the 21 required
  presets resolve to a genuinely distinct profile (verified by a
  dedicated test asserting no two share a profile id).
- **Procedural SVG cloud shapes (opaque clustered circles), not CSS
  gradient stacks, and not Canvas.** A cluster of overlapping, fully
  OPAQUE circles sharing one gradient fill blends into a single
  seamless silhouette (opaque same-fill shapes don't show seams at
  their overlaps) — a genuinely different technique from a translucent
  radial-gradient stack, which is why this actually fixes "looks like a
  blob" rather than just turning the opacity up on the same shape. Built
  as a `data:image/svg+xml` background-image reusing the EXISTING
  `.weather-cloud-layer` CSS (repeat-x + animated `background-position-x`)
  — no new DOM elements per particle, no Canvas for clouds (Canvas stays
  reserved for the actual particle systems, per the "no 5,000 DOM
  elements" performance constraint), no WebGL/Three.js.
- **A seeded PRNG for cloud shapes, not true randomness.** The same
  `(profile id, layer key)` pair always produces the same cluster
  arrangement — stable across re-renders of the same condition — while
  different conditions get genuinely different-looking clusters (not
  the same shapes recolored). Lightning bolts, by contrast, use a FRESH
  random seed at every flash — variety between flashes is the point
  there, not stability.
- **Sun/moon: two concentric layers, never an off-center highlight.**
  The previous sun's off-center radial-gradient highlight (`circle at
  35% 32%`) is precisely the technique that makes a flat circle read as
  a lit 3D sphere — i.e. a planet. Replacing it with two CONCENTRIC
  layers (a big blurred "bloom" behind a smaller near-blown-out "core,"
  both centered on the same point) reads as atmospheric light instead,
  with no shading cue implying a solid spherical object.
- **`sunVisibility.ts` stays the sole authority on sun/moon visibility —
  the profile matrix calls it, never re-derives the rule.** An earlier
  draft of `visualProfileFor()` computed `sunVisible: !isNight`/
  `moonVisible: isNight` inline per condition branch, which happened to
  match `isSunVisible`/`isMoonVisible`'s actual rule but was a SECOND,
  independent expression of it — exactly the "two pieces could disagree"
  risk this whole redesign exists to eliminate. Fixed before merging:
  every branch now calls `isSunVisible(sky, dayPhase)`/`isMoonVisible(sky,
  dayPhase)` directly.
- **Palette moved from 8 fixed CSS classes to a JS-generated
  `linear-gradient(...)` per profile.** Eight buckets (`.scene-rain-*`,
  `.scene-snow-*`, etc.) couldn't give drizzle/light/moderate/heavy rain
  (or light/moderate/heavy snow) their own distinct sky color without
  either adding many more CSS classes or accepting they'd share a
  palette. Generating the gradient string inline from
  `profile.skyTop`/`profile.skyBottom` gives every condition/intensity
  tier its own two hand-chosen colors with no new CSS needed per tier.
  Night palettes for the four sky-only conditions are hand-authored
  navy/indigo tones (not a darkened copy of the day palette — "night
  should feel naturally darker, not just the day scene with a dark
  filter"); precipitating conditions' night variants use a darken-AND-
  cool-shift transform (`nightVariant()`) toward navy, a middle ground
  between hand-authoring 10+ more full palettes and a flat brightness
  multiply that would look exactly like "day + filter."
- **Freezing precipitation gets its own `icy` flag on the particle
  profile, not just a different sky palette.** A colder sky color alone
  wasn't enough per the explicit requirement that freezing rain/drizzle
  "not simply reuse normal rain visuals unchanged" — `icy: true`
  switches the canvas particle color to a visibly brighter cyan-white
  and is asserted directly by a test (`freezingRain.precipitation.icy
  === true`, `plainRain.precipitation.icy === false`) rather than left
  as an implicit palette-only difference.
- **Particle depth bands sample a FRACTION of the profile's own range,
  not a separate hardcoded table per depth.** Previously `RAIN_DEPTH_PROFILE`/
  `SNOW_DEPTH_PROFILE` were three fixed tables independent of
  intensity — meaning "near" always looked the same regardless of
  whether the scene was light or heavy rain. Now each depth samples a
  sub-range of the RESOLVED profile's `[min, max]` (far = low end, near
  = high end), so "near is bigger/faster/brighter than far" holds
  within every intensity tier, while a heavier tier's whole range still
  sits above a lighter one's — both depth variation AND intensity
  variation come from one mechanism instead of two.
- **Z-index/stacking made explicit and verified, not just re-asserted.**
  The investigation confirmed the previous architecture was already
  structurally correct (weather visuals at `z-index: 0`, particles/
  lightning/scrim at `1`, content at `2`, all within one stacking
  context via `.weather-scene`'s `isolation: isolate`) — the reported
  "sun behind cards" issue was the CORRECT behavior already, just
  under-verified. Rather than leave that as an assumption, a dedicated
  test now renders a sun-visible scene and asserts its DOM position
  precedes `.weather-scene-content`, and the stacking rationale is
  documented explicitly in both `globals.css` and
  `docs/architecture.md` so a future change can't silently break it.
- **Fog gets its own rendering primitive (layered mist bands), not a
  reuse of the cloud-cluster system at low opacity.** "Mist passing
  through the scene" is a fundamentally different visual than clustered
  cauliflower clouds at low density — fog bands are horizontal, broad,
  low-frequency-moving light streaks (`.weather-fog-band`), entirely
  separate from `cloudShapes.ts`'s cluster generator.

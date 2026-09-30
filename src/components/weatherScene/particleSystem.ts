import type { PrecipitationVisual } from "./weatherVisualProfile";

/** Three depth bands so precipitation reads as layered (near/mid/far), not one flat sheet of identical streaks/flakes. */
export type ParticleDepth = "far" | "mid" | "near";

export interface Particle {
  x: number;
  y: number;
  /** px/frame at 60fps-equivalent — scaled by deltaMs when stepped. */
  speed: number;
  length: number;
  drift: number;
  driftPhase: number;
  depth: ParticleDepth;
  opacity: number;
  /** Rain only — a small constant horizontal-per-vertical ratio, giving each streak a slightly different fall angle rather than every drop falling arrow-straight. */
  angle: number;
}

const MAX_PARTICLES = 190;

/** Density (0-1, from the resolved `PrecipitationVisual`) maps directly to particle count — this is the PRIMARY visible signal that "heavy" is dramatically denser than "light", never capped away by a shared ceiling that flattens the difference until near the very top of the range. */
export function particleCountFor(density: number): number {
  return Math.max(4, Math.round(MAX_PARTICLES * Math.max(0, Math.min(1, density))));
}

// Far particles are the most common (a hazy backdrop), near ones the
// rarest (a few crisp foreground streaks/flakes) — this is what makes
// the layering read as depth rather than three identical bands.
const DEPTH_WEIGHTS: Record<ParticleDepth, number> = { far: 0.45, mid: 0.34, near: 0.21 };

/** Where within the profile's overall [min,max] range each depth samples from — far particles sample the low end, near particles the high end, so "near is bigger/faster/brighter than far" holds true within EVERY intensity tier, while the tier's own range still shifts the whole band up for heavier weather. */
const DEPTH_BAND: Record<ParticleDepth, [number, number]> = { far: [0, 0.4], mid: [0.32, 0.7], near: [0.62, 1] };

/** Snow's per-depth sideways drift amount — a physical depth cue independent of precipitation intensity, so kept as its own fixed table rather than threaded through `PrecipitationVisual`. */
const SNOW_DRIFT_BAND: Record<ParticleDepth, [number, number]> = { far: [0.15, 0.35], mid: [0.3, 0.55], near: [0.45, 0.8] };

function pickDepth(random: () => number): ParticleDepth {
  const r = random();
  if (r < DEPTH_WEIGHTS.far) return "far";
  if (r < DEPTH_WEIGHTS.far + DEPTH_WEIGHTS.mid) return "mid";
  return "near";
}

function sampleInBand(range: [number, number], band: [number, number], random: () => number): number {
  const bandMin = range[0] + (range[1] - range[0]) * band[0];
  const bandMax = range[0] + (range[1] - range[0]) * band[1];
  return bandMin + random() * (bandMax - bandMin);
}

export function createParticle(profile: PrecipitationVisual, width: number, height: number, random: () => number = Math.random): Particle {
  const depth = pickDepth(random);
  const band = DEPTH_BAND[depth];
  const x = random() * width;
  const y = random() * height;

  return {
    x,
    y,
    speed: sampleInBand(profile.speed, band, random),
    length: sampleInBand(profile.lengthPx, band, random),
    drift: profile.kind === "snow" ? sampleInBand(SNOW_DRIFT_BAND[depth], [0, 1], random) : 0,
    driftPhase: random() * Math.PI * 2,
    depth,
    opacity: sampleInBand(profile.opacity, band, random),
    angle: profile.kind === "rain" ? -0.14 + random() * 0.28 : 0,
  };
}

/** Advances one particle by `deltaMs` (frame-rate independent), wrapping back to the top once it falls past `height`. */
export function stepParticle(p: Particle, profile: PrecipitationVisual, width: number, height: number, deltaMs: number, random: () => number = Math.random): Particle {
  const frames = deltaMs / (1000 / 60);
  const y = p.y + p.speed * frames;
  const driftPhase = p.driftPhase + 0.02 * frames;
  const x = profile.kind === "snow" ? p.x + Math.sin(driftPhase) * p.drift : p.x + p.angle * p.speed * frames;

  if (y > height) {
    return { ...createParticle(profile, width, height, random), y: -10, x: random() * width };
  }
  return { ...p, x, y, driftPhase };
}

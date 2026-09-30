import { describe, expect, it } from "vitest";
import type { PrecipitationVisual } from "./weatherVisualProfile";
import { createParticle, particleCountFor, stepParticle, type Particle } from "./particleSystem";

function rainProfile(overrides: Partial<PrecipitationVisual> = {}): PrecipitationVisual {
  return { kind: "rain", density: 0.5, lengthPx: [10, 20], speed: [6, 10], opacity: [0.2, 0.4], hazeOpacity: 0.1, icy: false, ...overrides };
}

function snowProfile(overrides: Partial<PrecipitationVisual> = {}): PrecipitationVisual {
  return { kind: "snow", density: 0.5, lengthPx: [2, 4], speed: [0.5, 1], opacity: [0.4, 0.7], hazeOpacity: 0.1, icy: false, ...overrides };
}

describe("particleCountFor", () => {
  it("never exceeds the hard cap regardless of density", () => {
    expect(particleCountFor(1)).toBeLessThanOrEqual(190);
  });

  it("scales roughly proportionally with density — a materially different count, not a flattened-near-the-top curve", () => {
    const low = particleCountFor(0.2);
    const high = particleCountFor(1);
    expect(high).toBeGreaterThan(low * 3);
  });

  it("never produces zero particles even for a very low but real density", () => {
    expect(particleCountFor(0.02)).toBeGreaterThan(0);
  });
});

describe("createParticle / stepParticle — rain", () => {
  it("creates a particle within the given bounds", () => {
    const random = () => 0.5;
    const p = createParticle(rainProfile(), 200, 400, random);
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.x).toBeLessThanOrEqual(200);
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeLessThanOrEqual(400);
  });

  it("moves a rain particle downward over time", () => {
    const profile = rainProfile();
    const p = createParticle(profile, 200, 400, () => 0.2);
    const stepped = stepParticle(p, profile, 200, 400, 16);
    expect(stepped.y).toBeGreaterThan(p.y);
  });

  it("wraps a particle back to the top once it falls past the bottom", () => {
    const profile = rainProfile();
    const p: Particle = { x: 50, y: 395, speed: 10, length: 10, drift: 0, driftPhase: 0, depth: "near", opacity: 0.5, angle: 0 };
    const stepped = stepParticle(p, profile, 200, 400, 1000, () => 0.3);
    expect(stepped.y).toBeLessThan(0);
  });

  it("is frame-rate independent — a larger deltaMs moves the particle further", () => {
    const profile = rainProfile();
    const p = createParticle(profile, 200, 400, () => 0.1);
    const smallStep = stepParticle(p, profile, 200, 400, 8);
    const bigStep = stepParticle(p, profile, 200, 400, 32);
    expect(bigStep.y - p.y).toBeGreaterThan(smallStep.y - p.y);
  });

  it("assigns every particle a depth band (far/mid/near), never leaving it undefined", () => {
    const depths = new Set<string>();
    let seed = 0;
    for (let i = 0; i < 50; i++) {
      seed = (seed + 0.137) % 1;
      depths.add(createParticle(rainProfile(), 200, 400, () => seed).depth);
    }
    expect([...depths].every((d) => ["far", "mid", "near"].includes(d))).toBe(true);
  });

  it("gives near-depth particles a longer streak and higher opacity than far-depth ones, within the SAME profile", () => {
    const profile = rainProfile();
    const far = createParticle(profile, 200, 400, () => 0.01);
    const near = createParticle(profile, 200, 400, () => 0.99);
    expect(far.depth).toBe("far");
    expect(near.depth).toBe("near");
    expect(near.length).toBeGreaterThan(far.length);
    expect(near.opacity).toBeGreaterThan(far.opacity);
    expect(near.speed).toBeGreaterThan(far.speed);
  });

  it("gives rain a slight, non-uniform fall angle rather than every drop falling arrow-straight", () => {
    const angles = new Set<number>();
    let seed = 0;
    for (let i = 0; i < 20; i++) {
      seed = (seed + 0.091) % 1;
      angles.add(createParticle(rainProfile(), 200, 400, () => seed).angle);
    }
    expect(angles.size).toBeGreaterThan(1);
  });

  it("moves a rain particle sideways according to its own angle when stepped", () => {
    const profile = rainProfile();
    const p: Particle = { x: 50, y: 10, speed: 12, length: 20, drift: 0, driftPhase: 0, depth: "near", opacity: 0.5, angle: 0.1 };
    const stepped = stepParticle(p, profile, 200, 400, 16);
    expect(stepped.x).toBeGreaterThan(p.x);
  });

  it("a heavier-intensity profile produces meaningfully longer/faster particles than a lighter one, at the same depth", () => {
    const light = createParticle(rainProfile({ lengthPx: [8, 13], speed: [5, 7] }), 200, 400, () => 0.99);
    const heavy = createParticle(rainProfile({ lengthPx: [18, 30], speed: [10, 14.5] }), 200, 400, () => 0.99);
    expect(heavy.length).toBeGreaterThan(light.length);
    expect(heavy.speed).toBeGreaterThan(light.speed);
  });
});

describe("createParticle / stepParticle — snow", () => {
  it("gives near-depth snow particles a larger flake and higher opacity than far-depth ones", () => {
    const profile = snowProfile();
    const far = createParticle(profile, 200, 400, () => 0.01);
    const near = createParticle(profile, 200, 400, () => 0.99);
    expect(near.length).toBeGreaterThan(far.length);
    expect(near.opacity).toBeGreaterThan(far.opacity);
  });

  it("never gives snow a fall angle (it drifts sideways via a sine phase instead)", () => {
    expect(createParticle(snowProfile(), 200, 400, () => 0.5).angle).toBe(0);
  });

  it("gives near-depth snow more sideways drift than far-depth snow", () => {
    const profile = snowProfile();
    const far = createParticle(profile, 200, 400, () => 0.01);
    const near = createParticle(profile, 200, 400, () => 0.99);
    expect(near.drift).toBeGreaterThan(far.drift);
  });
});

import { describe, expect, it } from "vitest";
import { particleCountFor } from "./particleSystem";
import { visualProfileFor, type VisualProfileInput } from "./weatherVisualProfile";

function input(overrides: Partial<VisualProfileInput>): VisualProfileInput {
  return { condition: "clear", intensity: "light", sky: "clear", precipitationType: "none", lightning: false, dayPhase: "day", ...overrides };
}

describe("visualProfileFor — cloud density escalation", () => {
  it("clear < mainly-clear < partly-cloudy < overcast <= storm, meaningfully (not just epsilon) different", () => {
    const clear = visualProfileFor(input({ condition: "clear", sky: "clear" })).cloudDensityScore;
    const mainlyClear = visualProfileFor(input({ condition: "clear", sky: "mainly-clear" })).cloudDensityScore;
    const partlyCloudy = visualProfileFor(input({ condition: "partly-cloudy", sky: "partly-cloudy" })).cloudDensityScore;
    const overcast = visualProfileFor(input({ condition: "cloudy", sky: "overcast" })).cloudDensityScore;
    const storm = visualProfileFor(input({ condition: "thunderstorm", sky: "overcast", precipitationType: "none", lightning: true })).cloudDensityScore;

    expect(mainlyClear).toBeGreaterThan(clear);
    expect(partlyCloudy).toBeGreaterThan(mainlyClear + 0.1);
    expect(overcast).toBeGreaterThan(partlyCloudy + 0.1);
    expect(storm).toBeGreaterThanOrEqual(overcast);
  });

  it("mainly-clear day: exactly one cloud layer, with a small (3-4) cluster count — a few small clouds, never a dense field", () => {
    const layers = visualProfileFor(input({ condition: "clear", sky: "mainly-clear", dayPhase: "day" })).cloudLayers;
    expect(layers).toHaveLength(1);
    expect(layers[0].clusterCount).toBeGreaterThanOrEqual(3);
    expect(layers[0].clusterCount).toBeLessThanOrEqual(4);
  });

  it("mainly-clear reuses partly-cloudy's own far-layer tint pair and a comparable alpha — never a bespoke low-alpha recipe of its own", () => {
    const mainlyClearLayer = visualProfileFor(input({ condition: "clear", sky: "mainly-clear", dayPhase: "day" })).cloudLayers[0];
    const partlyCloudyFar = visualProfileFor(input({ condition: "partly-cloudy", sky: "partly-cloudy", dayPhase: "day" })).cloudLayers.find((l) => l.key === "far")!;
    expect(mainlyClearLayer.topColor).toBe(partlyCloudyFar.topColor);
    expect(mainlyClearLayer.bottomColor).toBe(partlyCloudyFar.bottomColor);
    // Not necessarily IDENTICAL alpha (mainly-clear can be tuned slightly), but never the old faint ~0.3 "artifact" level.
    expect(mainlyClearLayer.fillAlpha).toBeGreaterThanOrEqual(0.4);
  });

  it("mainly-clear's cloud scale is meaningfully smaller than partly-cloudy's — small clouds, not partly-cloudy-sized ones", () => {
    const mainlyClearScale = visualProfileFor(input({ condition: "clear", sky: "mainly-clear" })).cloudLayers[0].scale;
    const partlyCloudyFarScale = visualProfileFor(input({ condition: "partly-cloudy", sky: "partly-cloudy" })).cloudLayers.find((l) => l.key === "far")!.scale;
    expect(mainlyClearScale).toBeLessThan(partlyCloudyFarScale);
  });

  it("clear has no cloud layers at all; overcast/storm have real, multi-layer cloud cover", () => {
    expect(visualProfileFor(input({ condition: "clear", sky: "clear" })).cloudLayers).toHaveLength(0);
    expect(visualProfileFor(input({ condition: "cloudy", sky: "overcast" })).cloudLayers.length).toBeGreaterThanOrEqual(3);
    expect(visualProfileFor(input({ condition: "thunderstorm", sky: "overcast", lightning: true })).cloudLayers.length).toBeGreaterThanOrEqual(3);
  });

  it("overcast cloud layers are visibly denser (higher fill alpha) than partly-cloudy's", () => {
    const overcastAlpha = Math.max(...visualProfileFor(input({ condition: "cloudy", sky: "overcast" })).cloudLayers.map((l) => l.fillAlpha));
    const partlyCloudyAlpha = Math.max(...visualProfileFor(input({ condition: "partly-cloudy", sky: "partly-cloudy" })).cloudLayers.map((l) => l.fillAlpha));
    expect(overcastAlpha).toBeGreaterThan(partlyCloudyAlpha);
  });
});

describe("visualProfileFor — rain intensity escalation (drizzle < light < moderate < heavy)", () => {
  const drizzle = visualProfileFor(input({ condition: "drizzle", intensity: "light", sky: "overcast", precipitationType: "rain" })).precipitation!;
  const light = visualProfileFor(input({ condition: "rain", intensity: "light", sky: "overcast", precipitationType: "rain" })).precipitation!;
  const moderate = visualProfileFor(input({ condition: "rain", intensity: "moderate", sky: "overcast", precipitationType: "rain" })).precipitation!;
  const heavy = visualProfileFor(input({ condition: "heavy-rain", intensity: "heavy", sky: "overcast", precipitationType: "rain" })).precipitation!;

  it("density strictly increases", () => {
    expect(drizzle.density).toBeLessThan(light.density);
    expect(light.density).toBeLessThan(moderate.density);
    expect(moderate.density).toBeLessThan(heavy.density);
  });

  it("streak length strictly increases", () => {
    expect(drizzle.lengthPx[1]).toBeLessThan(light.lengthPx[1]);
    expect(light.lengthPx[1]).toBeLessThan(moderate.lengthPx[1]);
    expect(moderate.lengthPx[1]).toBeLessThan(heavy.lengthPx[1]);
  });

  it("speed strictly increases", () => {
    expect(drizzle.speed[1]).toBeLessThan(light.speed[1]);
    expect(light.speed[1]).toBeLessThan(moderate.speed[1]);
    expect(moderate.speed[1]).toBeLessThan(heavy.speed[1]);
  });

  it("haze strictly increases (sky reads progressively darker/mistier)", () => {
    expect(drizzle.hazeOpacity).toBeLessThan(light.hazeOpacity);
    expect(light.hazeOpacity).toBeLessThan(moderate.hazeOpacity);
    expect(moderate.hazeOpacity).toBeLessThan(heavy.hazeOpacity);
  });

  it("sky darkens (lower brightness) from drizzle through heavy rain", () => {
    const brightness = (hex: string) => {
      const n = parseInt(hex.replace("#", ""), 16);
      return ((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255);
    };
    const drizzleProfile = visualProfileFor(input({ condition: "drizzle", intensity: "light", sky: "overcast", precipitationType: "rain" }));
    const heavyProfile = visualProfileFor(input({ condition: "heavy-rain", intensity: "heavy", sky: "overcast", precipitationType: "rain" }));
    expect(brightness(heavyProfile.skyTop)).toBeLessThan(brightness(drizzleProfile.skyTop));
  });
});

describe("visualProfileFor — snow intensity escalation (light < moderate < heavy)", () => {
  const light = visualProfileFor(input({ condition: "snow", intensity: "light", sky: "overcast", precipitationType: "snow" })).precipitation!;
  const moderate = visualProfileFor(input({ condition: "snow", intensity: "moderate", sky: "overcast", precipitationType: "snow" })).precipitation!;
  const heavy = visualProfileFor(input({ condition: "heavy-snow", intensity: "heavy", sky: "overcast", precipitationType: "snow" })).precipitation!;

  it("density strictly increases", () => {
    expect(light.density).toBeLessThan(moderate.density);
    expect(moderate.density).toBeLessThan(heavy.density);
  });

  it("haze strictly increases — heavy snow reduces visibility more than light snow", () => {
    expect(light.hazeOpacity).toBeLessThan(moderate.hazeOpacity);
    expect(moderate.hazeOpacity).toBeLessThan(heavy.hazeOpacity);
  });

  it("flake size range grows with intensity", () => {
    expect(light.lengthPx[1]).toBeLessThan(moderate.lengthPx[1]);
    expect(moderate.lengthPx[1]).toBeLessThan(heavy.lengthPx[1]);
  });

  it("snow showers is its own distinct profile, not an alias of moderate snow", () => {
    const showers = visualProfileFor(input({ condition: "snow", intensity: "moderate", sky: "partly-cloudy", precipitationType: "snow" }));
    const moderateSnow = visualProfileFor(input({ condition: "snow", intensity: "moderate", sky: "overcast", precipitationType: "snow" }));
    expect(showers.id).not.toBe(moderateSnow.id);
    expect(showers.cloudLayers).not.toEqual(moderateSnow.cloudLayers);
  });

  it("even light snow is unmistakably visible — a real particle count and a real opacity floor, never 'maybe two flakes'", () => {
    expect(particleCountFor(light.density)).toBeGreaterThanOrEqual(60);
    expect(light.opacity[0]).toBeGreaterThanOrEqual(0.4);
  });

  it("heavy snow is strongly, unmistakably denser than light — not just a marginal step up", () => {
    expect(particleCountFor(heavy.density)).toBeGreaterThan(particleCountFor(light.density) * 2);
  });
});

describe("visualProfileFor — freezing precipitation is visually distinct from ordinary rain", () => {
  it("uses a different palette and a colder/icy particle treatment than plain rain at the same intensity", () => {
    const freezingRain = visualProfileFor(input({ condition: "freezing-rain", intensity: "moderate", sky: "overcast", precipitationType: "freezing" }));
    const plainRain = visualProfileFor(input({ condition: "rain", intensity: "moderate", sky: "overcast", precipitationType: "rain" }));

    expect(freezingRain.skyTop).not.toBe(plainRain.skyTop);
    expect(freezingRain.precipitation!.icy).toBe(true);
    expect(plainRain.precipitation!.icy).toBe(false);
  });

  it("freezing drizzle and freezing rain are themselves distinct tiers", () => {
    const drizzle = visualProfileFor(input({ condition: "freezing-rain", intensity: "light", sky: "overcast", precipitationType: "freezing" }));
    const rain = visualProfileFor(input({ condition: "freezing-rain", intensity: "moderate", sky: "overcast", precipitationType: "freezing" }));
    expect(drizzle.precipitation!.density).toBeLessThan(rain.precipitation!.density);
  });
});

describe("visualProfileFor — thunderstorm variants", () => {
  it("dry thunderstorm: lightning true, no rain particles, storm cloud profile", () => {
    const dry = visualProfileFor(input({ condition: "thunderstorm", sky: "overcast", precipitationType: "none", intensity: "heavy", lightning: true }));
    expect(dry.lightning).toBe(true);
    expect(dry.precipitation).toBeNull();
    expect(dry.cloudDensityScore).toBeGreaterThanOrEqual(0.9);
  });

  it("storm + light rain: lightning true, light-rain-scale precipitation profile", () => {
    const wetLight = visualProfileFor(input({ condition: "thunderstorm", sky: "overcast", precipitationType: "rain", intensity: "light", lightning: true }));
    expect(wetLight.lightning).toBe(true);
    expect(wetLight.precipitation).not.toBeNull();
    expect(wetLight.precipitation!.density).toBeLessThan(0.6);
  });

  it("storm + heavy rain: lightning true, heavy-rain-scale precipitation profile, denser than storm + light rain", () => {
    const wetHeavy = visualProfileFor(input({ condition: "thunderstorm", sky: "overcast", precipitationType: "rain", intensity: "heavy", lightning: true }));
    const wetLight = visualProfileFor(input({ condition: "thunderstorm", sky: "overcast", precipitationType: "rain", intensity: "light", lightning: true }));
    expect(wetHeavy.lightning).toBe(true);
    expect(wetHeavy.precipitation!.density).toBeGreaterThan(wetLight.precipitation!.density);
  });

  it("all three thunderstorm variants (dry, +light rain, +heavy rain) resolve to distinct profile ids", () => {
    const ids = new Set([
      visualProfileFor(input({ condition: "thunderstorm", sky: "overcast", precipitationType: "none", intensity: "heavy", lightning: true })).id,
      visualProfileFor(input({ condition: "thunderstorm", sky: "overcast", precipitationType: "rain", intensity: "light", lightning: true })).id,
      visualProfileFor(input({ condition: "thunderstorm", sky: "overcast", precipitationType: "rain", intensity: "heavy", lightning: true })).id,
    ]);
    expect(ids.size).toBe(3);
  });
});

describe("visualProfileFor — clear-night stars", () => {
  it("full stars for clear night", () => {
    expect(visualProfileFor(input({ condition: "clear", sky: "clear", dayPhase: "night" })).starDots).toBe("full");
  });

  it("full stars for mainly-clear night too", () => {
    expect(visualProfileFor(input({ condition: "clear", sky: "mainly-clear", dayPhase: "night" })).starDots).toBe("full");
  });

  it("no stars at all, day or night, for clear/mainly-clear DAY", () => {
    expect(visualProfileFor(input({ condition: "clear", sky: "clear", dayPhase: "day" })).starDots).toBe("none");
  });

  it("sparse (reduced) stars for partly-cloudy night — never the full clear-night field", () => {
    expect(visualProfileFor(input({ condition: "partly-cloudy", sky: "partly-cloudy", dayPhase: "night" })).starDots).toBe("sparse");
  });

  it("no stars for overcast night — never visible through thick cloud", () => {
    expect(visualProfileFor(input({ condition: "cloudy", sky: "overcast", dayPhase: "night" })).starDots).toBe("none");
  });

  it("no stars for foggy night", () => {
    expect(visualProfileFor(input({ condition: "fog", sky: "foggy", dayPhase: "night" })).starDots).toBe("none");
  });

  it("no stars for a stormy or precipitating night", () => {
    expect(visualProfileFor(input({ condition: "rain", intensity: "moderate", sky: "overcast", precipitationType: "rain", dayPhase: "night" })).starDots).toBe("none");
    expect(visualProfileFor(input({ condition: "thunderstorm", sky: "overcast", lightning: true, dayPhase: "night" })).starDots).toBe("none");
  });
});

describe("visualProfileFor — celestial visibility agrees with sunVisibility.ts's rules", () => {
  it("clear day: sun visible", () => {
    expect(visualProfileFor(input({ condition: "clear", sky: "clear", dayPhase: "day" })).sunVisible).toBe(true);
  });
  it("clear night: moon visible", () => {
    expect(visualProfileFor(input({ condition: "clear", sky: "clear", dayPhase: "night" })).moonVisible).toBe(true);
  });
  it("overcast day: sun hidden", () => {
    expect(visualProfileFor(input({ condition: "cloudy", sky: "overcast", dayPhase: "day" })).sunVisible).toBe(false);
  });
  it("overcast night: moon hidden", () => {
    expect(visualProfileFor(input({ condition: "cloudy", sky: "overcast", dayPhase: "night" })).moonVisible).toBe(false);
  });
  it("fog: sun hidden even by day", () => {
    expect(visualProfileFor(input({ condition: "fog", sky: "foggy", dayPhase: "day" })).sunVisible).toBe(false);
  });
  it("storm: sun/moon hidden regardless of day phase", () => {
    expect(visualProfileFor(input({ condition: "thunderstorm", sky: "overcast", lightning: true, dayPhase: "day" })).sunVisible).toBe(false);
    expect(visualProfileFor(input({ condition: "thunderstorm", sky: "overcast", lightning: true, dayPhase: "night" })).moonVisible).toBe(false);
  });
});

describe("visualProfileFor — every Scene Lab preset gets a materially distinct profile", () => {
  it("no two of the 21 required preset combinations share an identical profile id", () => {
    const combos: VisualProfileInput[] = [
      input({ condition: "clear", sky: "clear", dayPhase: "day" }),
      input({ condition: "clear", sky: "clear", dayPhase: "night" }),
      input({ condition: "clear", sky: "mainly-clear", dayPhase: "day" }),
      input({ condition: "partly-cloudy", sky: "partly-cloudy", dayPhase: "day" }),
      input({ condition: "partly-cloudy", sky: "partly-cloudy", dayPhase: "night" }),
      input({ condition: "cloudy", sky: "overcast", dayPhase: "day" }),
      input({ condition: "cloudy", sky: "overcast", dayPhase: "night" }),
      input({ condition: "fog", sky: "foggy", dayPhase: "day" }),
      input({ condition: "drizzle", intensity: "light", sky: "overcast", precipitationType: "rain" }),
      input({ condition: "rain", intensity: "light", sky: "overcast", precipitationType: "rain" }),
      input({ condition: "rain", intensity: "moderate", sky: "overcast", precipitationType: "rain" }),
      input({ condition: "heavy-rain", intensity: "heavy", sky: "overcast", precipitationType: "rain" }),
      input({ condition: "freezing-rain", intensity: "light", sky: "overcast", precipitationType: "freezing" }),
      input({ condition: "freezing-rain", intensity: "moderate", sky: "overcast", precipitationType: "freezing" }),
      input({ condition: "snow", intensity: "light", sky: "overcast", precipitationType: "snow" }),
      input({ condition: "snow", intensity: "moderate", sky: "overcast", precipitationType: "snow" }),
      input({ condition: "heavy-snow", intensity: "heavy", sky: "overcast", precipitationType: "snow" }),
      input({ condition: "snow", intensity: "moderate", sky: "partly-cloudy", precipitationType: "snow" }),
      input({ condition: "thunderstorm", sky: "overcast", precipitationType: "none", intensity: "heavy", lightning: true }),
      input({ condition: "thunderstorm", sky: "overcast", precipitationType: "rain", intensity: "light", lightning: true }),
      input({ condition: "thunderstorm", sky: "overcast", precipitationType: "rain", intensity: "heavy", lightning: true }),
    ];

    const idDayKeys = combos.map((c) => `${visualProfileFor(c).id}-${c.dayPhase}`);
    expect(new Set(idDayKeys).size).toBe(idDayKeys.length);
  });
});

describe("visualProfileFor — no data / unknown condition stays neutral", () => {
  it("renders no clouds, no precipitation, no sun/moon, no lightning", () => {
    const neutral = visualProfileFor(input({ condition: "unknown", sky: "clear", dayPhase: "day" }));
    expect(neutral.cloudLayers).toHaveLength(0);
    expect(neutral.precipitation).toBeNull();
    expect(neutral.sunVisible).toBe(false);
    expect(neutral.moonVisible).toBe(false);
    expect(neutral.lightning).toBe(false);
  });
});

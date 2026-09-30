import { afterEach, describe, expect, it } from "vitest";
import { applyDevSceneOverride, setDevSceneOverride, type DevSceneOverride } from "./devSceneOverride";
import type { WeatherSceneDescriptor } from "./types";

afterEach(() => setDevSceneOverride(null));

function baseScene(overrides: Partial<WeatherSceneDescriptor> = {}): WeatherSceneDescriptor {
  return {
    condition: "clear",
    intensity: "light",
    dayPhase: "day",
    precipitationType: "none",
    cloudiness: "clear",
    windLevel: "calm",
    sky: "clear",
    lightning: false,
    selectedTripTime: new Date("2026-09-24T15:00:00Z"),
    dataStatus: "resolved",
    derivationNotes: [],
    ...overrides,
  };
}

function preset(overrides: Partial<DevSceneOverride> = {}): DevSceneOverride {
  return {
    label: "Snow",
    condition: "snow",
    dayPhase: "night",
    sky: "overcast",
    precipitationType: "snow",
    intensity: "moderate",
    lightning: false,
    ...overrides,
  };
}

describe("applyDevSceneOverride", () => {
  it("returns the original scene unchanged when there is no override", () => {
    const scene = baseScene();
    expect(applyDevSceneOverride(scene, null)).toBe(scene);
  });

  it("substitutes the full compositional tuple without mutating the original scene object", () => {
    const scene = baseScene({ condition: "clear", dayPhase: "day" });
    const overridden = applyDevSceneOverride(scene, preset({ condition: "snow", dayPhase: "night" }));

    expect(overridden.condition).toBe("snow");
    expect(overridden.dayPhase).toBe("night");
    expect(overridden.precipitationType).toBe("snow");
    expect(overridden.sky).toBe("overcast");
    expect(scene.condition).toBe("clear"); // original untouched
    expect(scene.dayPhase).toBe("day");
  });

  it("can override to a dry thunderstorm — lightning true, no precipitation", () => {
    const overridden = applyDevSceneOverride(baseScene(), preset({ label: "Thunderstorm", condition: "thunderstorm", dayPhase: "day", sky: "overcast", precipitationType: "none", lightning: true }));
    expect(overridden.lightning).toBe(true);
    expect(overridden.precipitationType).toBe("none");
  });

  it("notes that the override is development-only and presentation-only", () => {
    const overridden = applyDevSceneOverride(baseScene(), preset({ label: "Rain", condition: "rain", dayPhase: "day", precipitationType: "rain" }));
    expect(overridden.derivationNotes.some((n) => /does not affect risk\/duration\/timing/.test(n))).toBe(true);
  });
});

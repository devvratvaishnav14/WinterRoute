// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { WeatherSceneDescriptor } from "@/lib/weatherScene/types";
import { WeatherSceneBackground } from "./WeatherSceneBackground";

afterEach(cleanup);

function scene(overrides: Partial<WeatherSceneDescriptor> = {}): WeatherSceneDescriptor {
  return {
    condition: "rain",
    intensity: "moderate",
    dayPhase: "day",
    precipitationType: "rain",
    cloudiness: "overcast",
    windLevel: "calm",
    sky: "overcast",
    lightning: false,
    selectedTripTime: new Date("2026-09-24T15:00:00Z"),
    dataStatus: "resolved",
    derivationNotes: [],
    ...overrides,
  };
}

function skyBackground(container: HTMLElement): string | undefined {
  return container.querySelector<HTMLElement>(".weather-scene-sky")?.style.background;
}

describe("WeatherSceneBackground", () => {
  it("renders a neutral sky (no clouds/sun/moon), never a guessed condition, when scene is null", () => {
    const { container } = render(<WeatherSceneBackground scene={null}>content</WeatherSceneBackground>);
    expect(skyBackground(container)).toBeTruthy();
    expect(container.querySelector(".weather-scene-sun-core")).toBeNull();
    expect(container.querySelectorAll(".weather-cloud-layer").length).toBe(0);
  });

  it("renders the same neutral sky when weather data is unavailable, never assuming clear", () => {
    const { container: unavailable } = render(
      <WeatherSceneBackground scene={scene({ dataStatus: "unavailable", condition: "unknown" })}>content</WeatherSceneBackground>,
    );
    const { container: nullScene } = render(<WeatherSceneBackground scene={null}>content</WeatherSceneBackground>);
    expect(skyBackground(unavailable)).toBe(skyBackground(nullScene));
  });

  it("renders a genuinely different sky gradient per resolved condition — never the same palette for everything", () => {
    const { container: snowNight } = render(<WeatherSceneBackground scene={scene({ condition: "snow", intensity: "light", sky: "overcast", precipitationType: "snow", dayPhase: "night" })}>content</WeatherSceneBackground>);
    cleanup();
    const { container: clearDay } = render(<WeatherSceneBackground scene={scene({ condition: "clear", sky: "clear", precipitationType: "none", dayPhase: "day" })}>content</WeatherSceneBackground>);
    expect(skyBackground(snowNight)).not.toBe(skyBackground(clearDay));
  });

  it("always renders its children regardless of scene state", () => {
    render(<WeatherSceneBackground scene={null}>{"the results content"}</WeatherSceneBackground>);
    expect(screen.getByText("the results content")).toBeTruthy();
  });

  it("does not render a particle canvas for a clear/no-precipitation scene", () => {
    const { container } = render(<WeatherSceneBackground scene={scene({ condition: "clear", precipitationType: "none" })}>content</WeatherSceneBackground>);
    expect(container.querySelector("canvas")).toBeNull();
  });

  it("does not render a particle canvas for a DRY thunderstorm (lightning, no measurable rain)", () => {
    const { container } = render(
      <WeatherSceneBackground scene={scene({ condition: "thunderstorm", precipitationType: "none", lightning: true })}>content</WeatherSceneBackground>,
    );
    expect(container.querySelector("canvas")).toBeNull();
    expect(container.querySelector(".weather-scene-lightning")).toBeTruthy();
  });

  it("renders a particle canvas for a precipitating scene", () => {
    const { container } = render(<WeatherSceneBackground scene={scene({ condition: "rain" })}>content</WeatherSceneBackground>);
    expect(container.querySelector("canvas")).toBeTruthy();
  });

  it("respects prefers-reduced-motion: no particle canvas, even for a precipitating scene", () => {
    const matchMediaMock = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal("matchMedia", matchMediaMock);

    const { container } = render(<WeatherSceneBackground scene={scene({ condition: "snow" })}>content</WeatherSceneBackground>);
    expect(container.querySelector("canvas")).toBeNull();

    vi.unstubAllGlobals();
  });

  it("only shows the lightning flash layer for thunderstorm scenes", () => {
    const { container: withStorm } = render(<WeatherSceneBackground scene={scene({ condition: "thunderstorm", lightning: true })}>content</WeatherSceneBackground>);
    expect(withStorm.querySelector(".weather-scene-lightning")).toBeTruthy();

    cleanup();

    const { container: withoutStorm } = render(<WeatherSceneBackground scene={scene({ condition: "rain" })}>content</WeatherSceneBackground>);
    expect(withoutStorm.querySelector(".weather-scene-lightning")).toBeNull();
  });

  it("mounts no cloud layers for a clear scene", () => {
    const { container } = render(<WeatherSceneBackground scene={scene({ condition: "clear" })}>content</WeatherSceneBackground>);
    expect(container.querySelectorAll(".weather-cloud-layer").length).toBe(0);
  });

  it("mainly-clear day mounts exactly one cloud layer, rendered via the organic path renderer with a real, non-artifact-level fill alpha — a few small clouds, not stray white spots", () => {
    const { container } = render(<WeatherSceneBackground scene={scene({ condition: "clear", sky: "mainly-clear", precipitationType: "none" })}>content</WeatherSceneBackground>);
    const layers = container.querySelectorAll<HTMLElement>(".weather-cloud-layer");
    expect(layers.length).toBe(1);
    const image = decodeURIComponent(layers[0].style.backgroundImage);
    expect(image).toContain("<path");
    expect(image).not.toContain("<ellipse");
    expect(image).not.toContain("<circle");
    // At least 4 blob shapes (one small cluster's worth) — never a single isolated faint smudge.
    expect((image.match(/<path /g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it("mounts two visible depth cloud layers for partly-cloudy", () => {
    const { container } = render(<WeatherSceneBackground scene={scene({ condition: "partly-cloudy" })}>content</WeatherSceneBackground>);
    expect(container.querySelectorAll(".weather-cloud-layer").length).toBe(2);
  });

  it("mounts three depth cloud layers for cloudy/rain/snow/storm — clouds dominate the background", () => {
    for (const condition of ["cloudy", "rain", "snow", "thunderstorm"] as const) {
      const { container } = render(<WeatherSceneBackground scene={scene({ condition })}>content</WeatherSceneBackground>);
      expect(container.querySelectorAll(".weather-cloud-layer").length).toBe(3);
      cleanup();
    }
  });

  it("every condition's cloud layers use the organic path-based renderer — never the old ellipse/circle-based one", () => {
    const cases: Array<Partial<WeatherSceneDescriptor>> = [
      { condition: "clear", sky: "mainly-clear" },
      { condition: "partly-cloudy", sky: "partly-cloudy" },
      { condition: "cloudy", sky: "overcast" },
      { condition: "rain", intensity: "light", sky: "overcast", precipitationType: "rain" },
      { condition: "heavy-rain", intensity: "heavy", sky: "overcast", precipitationType: "rain" },
      { condition: "heavy-snow", intensity: "heavy", sky: "overcast", precipitationType: "snow" },
      { condition: "thunderstorm", sky: "overcast", precipitationType: "rain", intensity: "heavy", lightning: true },
    ];
    for (const overrides of cases) {
      const { container } = render(<WeatherSceneBackground scene={scene(overrides)}>content</WeatherSceneBackground>);
      const layers = container.querySelectorAll<HTMLElement>(".weather-cloud-layer");
      expect(layers.length).toBeGreaterThan(0);
      for (const layer of layers) {
        const image = decodeURIComponent(layer.style.backgroundImage);
        expect(image).toContain("<path");
        expect(image).not.toContain("<ellipse");
        expect(image).not.toContain("<circle");
      }
      cleanup();
    }
  });

  it("mounts a prominent haze layer for fog", () => {
    const { container } = render(<WeatherSceneBackground scene={scene({ condition: "fog" })}>content</WeatherSceneBackground>);
    const haze = container.querySelector<HTMLElement>(".weather-scene-haze");
    expect(haze).toBeTruthy();
    expect(Number(haze?.style.opacity)).toBeGreaterThan(0.3);
  });

  it("never mounts cloud layers for the neutral (no-data) scene", () => {
    const { container } = render(<WeatherSceneBackground scene={null}>content</WeatherSceneBackground>);
    expect(container.querySelectorAll(".weather-cloud-layer").length).toBe(0);
  });

  it("always renders the readability scrim, above the atmosphere, regardless of condition", () => {
    const { container } = render(<WeatherSceneBackground scene={scene({ condition: "heavy-snow" })}>content</WeatherSceneBackground>);
    expect(container.querySelector(".weather-scene-scrim")).toBeTruthy();
  });

  it("respects prefers-reduced-motion for cloud drift too (CSS handles the actual freeze; the layer still mounts as a static shape)", () => {
    const matchMediaMock = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    vi.stubGlobal("matchMedia", matchMediaMock);

    const { container } = render(<WeatherSceneBackground scene={scene({ condition: "cloudy" })}>content</WeatherSceneBackground>);
    // Reduced motion disables the *animation* via CSS (`@media (prefers-reduced-motion: reduce)`,
    // not conditional rendering) — the cloud shapes still mount, just static.
    expect(container.querySelectorAll(".weather-cloud-layer").length).toBe(3);

    vi.unstubAllGlobals();
  });

  it("truth table: overcast never shows a sun, day or night", () => {
    const { container: day } = render(<WeatherSceneBackground scene={scene({ condition: "cloudy", sky: "overcast" })}>content</WeatherSceneBackground>);
    expect(day.querySelector(".weather-scene-sun-core")).toBeNull();
    cleanup();
    const { container: night } = render(<WeatherSceneBackground scene={scene({ condition: "cloudy", sky: "overcast", dayPhase: "night" })}>content</WeatherSceneBackground>);
    expect(night.querySelector(".weather-scene-moon-core")).toBeNull();
  });

  it("truth table: partly cloudy day shows both the sun and cloud layers", () => {
    const { container } = render(<WeatherSceneBackground scene={scene({ condition: "partly-cloudy", sky: "partly-cloudy", precipitationType: "none" })}>content</WeatherSceneBackground>);
    expect(container.querySelector(".weather-scene-sun-core")).toBeTruthy();
    expect(container.querySelectorAll(".weather-cloud-layer").length).toBeGreaterThan(0);
  });

  it("truth table: clear day shows the sun with no cloud layers", () => {
    const { container } = render(<WeatherSceneBackground scene={scene({ condition: "clear", sky: "clear", precipitationType: "none" })}>content</WeatherSceneBackground>);
    expect(container.querySelector(".weather-scene-sun-core")).toBeTruthy();
    expect(container.querySelectorAll(".weather-cloud-layer").length).toBe(0);
  });

  it("truth table: rain scene shows rain particles and cloud layers together", () => {
    const { container } = render(<WeatherSceneBackground scene={scene({ condition: "rain", sky: "overcast", precipitationType: "rain" })}>content</WeatherSceneBackground>);
    expect(container.querySelector("canvas")).toBeTruthy();
    expect(container.querySelectorAll(".weather-cloud-layer").length).toBeGreaterThan(0);
  });

  it("truth table: snow scene shows snow particles within a cloudy atmosphere", () => {
    const { container } = render(<WeatherSceneBackground scene={scene({ condition: "snow", sky: "overcast", precipitationType: "snow" })}>content</WeatherSceneBackground>);
    expect(container.querySelector("canvas")).toBeTruthy();
    expect(container.querySelectorAll(".weather-cloud-layer").length).toBeGreaterThan(0);
  });

  it("truth table: thunderstorm + rain shows lightning, rain particles, and storm clouds together", () => {
    const { container } = render(
      <WeatherSceneBackground scene={scene({ condition: "thunderstorm", sky: "overcast", precipitationType: "rain", lightning: true })}>content</WeatherSceneBackground>,
    );
    expect(container.querySelector(".weather-scene-lightning")).toBeTruthy();
    expect(container.querySelector("canvas")).toBeTruthy();
    expect(container.querySelectorAll(".weather-cloud-layer").length).toBeGreaterThan(0);
  });

  it("truth table: thunderstorm without rain shows lightning and storm clouds, but no rain particles", () => {
    const { container } = render(
      <WeatherSceneBackground scene={scene({ condition: "thunderstorm", sky: "overcast", precipitationType: "none", lightning: true })}>content</WeatherSceneBackground>,
    );
    expect(container.querySelector(".weather-scene-lightning")).toBeTruthy();
    expect(container.querySelector("canvas")).toBeNull();
    expect(container.querySelectorAll(".weather-cloud-layer").length).toBeGreaterThan(0);
  });

  it("truth table: night never shows the sun", () => {
    const { container } = render(<WeatherSceneBackground scene={scene({ condition: "clear", sky: "clear", dayPhase: "night" })}>content</WeatherSceneBackground>);
    expect(container.querySelector(".weather-scene-sun-core")).toBeNull();
  });

  it("clear night shows the full star field", () => {
    const { container } = render(<WeatherSceneBackground scene={scene({ condition: "clear", sky: "clear", dayPhase: "night" })}>content</WeatherSceneBackground>);
    const stars = container.querySelector(".weather-scene-stars");
    expect(stars).toBeTruthy();
    expect(stars?.classList.contains("is-sparse")).toBe(false);
  });

  it("partly-cloudy night shows the sparse star variant, not the full field", () => {
    const { container } = render(
      <WeatherSceneBackground scene={scene({ condition: "partly-cloudy", sky: "partly-cloudy", precipitationType: "none", dayPhase: "night" })}>content</WeatherSceneBackground>,
    );
    expect(container.querySelector(".weather-scene-stars.is-sparse")).toBeTruthy();
  });

  it("overcast night shows no stars at all", () => {
    const { container } = render(<WeatherSceneBackground scene={scene({ condition: "cloudy", sky: "overcast", dayPhase: "night" })}>content</WeatherSceneBackground>);
    expect(container.querySelector(".weather-scene-stars")).toBeNull();
  });

  it("clear day shows no stars", () => {
    const { container } = render(<WeatherSceneBackground scene={scene({ condition: "clear", sky: "clear", precipitationType: "none", dayPhase: "day" })}>content</WeatherSceneBackground>);
    expect(container.querySelector(".weather-scene-stars")).toBeNull();
  });

  it("truth table: weather unavailable renders the neutral scene, no sun/moon/clouds/particles", () => {
    const { container } = render(<WeatherSceneBackground scene={scene({ dataStatus: "unavailable", condition: "unknown" })}>content</WeatherSceneBackground>);
    expect(skyBackground(container)).toBeTruthy();
    expect(container.querySelector(".weather-scene-sun-core")).toBeNull();
    expect(container.querySelector(".weather-scene-moon-core")).toBeNull();
    expect(container.querySelectorAll(".weather-cloud-layer").length).toBe(0);
    expect(container.querySelector("canvas")).toBeNull();
  });

  it("produces no horizontal-overflow-prone inline widths on the cloud/haze layers", () => {
    const { container } = render(<WeatherSceneBackground scene={scene({ condition: "rain" })}>content</WeatherSceneBackground>);
    for (const el of container.querySelectorAll<HTMLElement>(".weather-cloud-layer, .weather-scene-haze")) {
      expect(el.style.width).toBe("");
    }
  });

  it("stacking: the sun/moon and cloud layers precede content in DOM order, within a single scene stacking context, so they can never paint above a card", () => {
    const { container } = render(
      <WeatherSceneBackground scene={scene({ condition: "partly-cloudy", sky: "partly-cloudy", precipitationType: "none" })}>
        <div data-testid="card">content</div>
      </WeatherSceneBackground>,
    );
    const sun = container.querySelector(".weather-scene-sun-core")!;
    const clouds = container.querySelectorAll(".weather-cloud-layer");
    const content = container.querySelector(".weather-scene-content")!;

    expect(sun).toBeTruthy();
    expect(clouds.length).toBeGreaterThan(0);
    // DOCUMENT_POSITION_FOLLOWING (4) means `content` comes AFTER the weather-visual node — i.e. the visual renders first/behind.
    expect(sun.compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const cloud of clouds) {
      expect(cloud.compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    // The weather visuals and the content both live inside the SAME `.weather-scene` stacking context (isolation: isolate) —
    // never a separate positioned ancestor that could let a card's own z-index escape and paint below the weather layer.
    expect(container.querySelector(".weather-scene")?.contains(sun)).toBe(true);
    expect(container.querySelector(".weather-scene")?.contains(content)).toBe(true);
  });
});

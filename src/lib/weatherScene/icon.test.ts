import { describe, expect, it } from "vitest";
import { deriveWeatherIconKind } from "./icon";

describe("deriveWeatherIconKind — icon always agrees with the composed scene", () => {
  it("clear day -> sun; clear night -> moon", () => {
    expect(deriveWeatherIconKind("clear", "none", false, "day")).toBe("sun");
    expect(deriveWeatherIconKind("clear", "none", false, "night")).toBe("moon");
  });

  it("partly cloudy day -> sun+cloud; partly cloudy night -> moon+cloud", () => {
    expect(deriveWeatherIconKind("partly-cloudy", "none", false, "day")).toBe("sun-cloud");
    expect(deriveWeatherIconKind("partly-cloudy", "none", false, "night")).toBe("moon-cloud");
  });

  it("overcast never combines with sun or moon, day or night (never visible through thick cloud)", () => {
    expect(deriveWeatherIconKind("overcast", "none", false, "day")).toBe("cloud");
    expect(deriveWeatherIconKind("overcast", "none", false, "night")).toBe("cloud");
  });

  it("fog gets its own icon, never confused with plain cloud", () => {
    expect(deriveWeatherIconKind("foggy", "none", false, "day")).toBe("fog");
  });

  it("rain/freezing rain -> rain-cloud regardless of sky bucket", () => {
    expect(deriveWeatherIconKind("overcast", "rain", false, "day")).toBe("rain-cloud");
    expect(deriveWeatherIconKind("overcast", "freezing", false, "day")).toBe("rain-cloud");
  });

  it("snow/mixed -> snow icon", () => {
    expect(deriveWeatherIconKind("overcast", "snow", false, "day")).toBe("snow");
    expect(deriveWeatherIconKind("overcast", "mixed", false, "day")).toBe("snow");
  });

  it("dry thunderstorm (lightning, no precipitation) -> storm, never storm-rain", () => {
    expect(deriveWeatherIconKind("overcast", "none", true, "day")).toBe("storm");
  });

  it("thunderstorm with rain -> storm-rain, distinct from a dry storm", () => {
    expect(deriveWeatherIconKind("overcast", "rain", true, "day")).toBe("storm-rain");
  });

  it("lightning always wins over a plain precipitation icon (a storm is never shown as just 'rain')", () => {
    expect(deriveWeatherIconKind("overcast", "snow", true, "day")).not.toBe("snow");
  });
});

import { describe, expect, it } from "vitest";
import { formatAlertTitle } from "./titleCase";

describe("formatAlertTitle", () => {
  it("title-cases a lowercase alert title", () => {
    expect(formatAlertTitle("rainfall warning")).toBe("Rainfall Warning");
  });

  it("title-cases an all-caps alert title, not preserving the shouting", () => {
    expect(formatAlertTitle("SNOWFALL WARNING")).toBe("Snowfall Warning");
  });

  it("title-cases a multi-word statement", () => {
    expect(formatAlertTitle("special weather statement")).toBe("Special Weather Statement");
  });

  it("title-cases wind warning", () => {
    expect(formatAlertTitle("wind warning")).toBe("Wind Warning");
  });

  it("leaves an already-normal title sensible (idempotent)", () => {
    expect(formatAlertTitle("Wind Warning")).toBe("Wind Warning");
    expect(formatAlertTitle(formatAlertTitle("wind warning"))).toBe("Wind Warning");
  });

  it("lowercases minor words like 'for' and 'of' when not first", () => {
    expect(formatAlertTitle("special weather statement for the lower mainland")).toBe(
      "Special Weather Statement for the Lower Mainland",
    );
  });

  it("handles an empty string without throwing", () => {
    expect(formatAlertTitle("")).toBe("");
  });

  it("trims surrounding whitespace", () => {
    expect(formatAlertTitle("  rainfall warning  ")).toBe("Rainfall Warning");
  });
});

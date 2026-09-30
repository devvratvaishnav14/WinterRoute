import { describe, expect, it } from "vitest";
import { detectMunicipality, isSupportedMunicipality, type AddressComponent } from "./serviceArea";

function component(longText: string, ...types: string[]): AddressComponent {
  return { longText, types };
}

describe("detectMunicipality", () => {
  it("extracts the locality component", () => {
    const components = [
      component("8888", "street_number"),
      component("University Drive West", "route"),
      component("Burnaby", "locality", "political"),
      component("British Columbia", "administrative_area_level_1", "political"),
      component("Canada", "country", "political"),
    ];
    expect(detectMunicipality(components)).toBe("Burnaby");
  });

  it("returns null when there is no locality component", () => {
    const components = [
      component("British Columbia", "administrative_area_level_1", "political"),
      component("Canada", "country", "political"),
    ];
    expect(detectMunicipality(components)).toBeNull();
  });

  it("returns null for an empty address component list", () => {
    expect(detectMunicipality([])).toBeNull();
  });
});

describe("isSupportedMunicipality", () => {
  it.each(["Vancouver", "Burnaby", "Surrey"])("accepts %s", (city) => {
    expect(isSupportedMunicipality(city)).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isSupportedMunicipality("burnaby")).toBe(true);
    expect(isSupportedMunicipality("SURREY")).toBe(true);
  });

  it.each(["Richmond", "Coquitlam", "Calgary", "Toronto", "New Westminster"])(
    "rejects %s",
    (city) => {
      expect(isSupportedMunicipality(city)).toBe(false);
    },
  );

  it("rejects null (no detected municipality)", () => {
    expect(isSupportedMunicipality(null)).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isSupportedMunicipality("")).toBe(false);
  });
});

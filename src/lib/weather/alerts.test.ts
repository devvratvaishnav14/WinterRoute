import { describe, expect, it } from "vitest";
import type { EcccAlertFeature } from "./providers/eccc";
import {
  ecccFeatureToWeatherAlert,
  isAlertRelevantToRoute,
  isEcccAlertActive,
  isPointInAlertGeometry,
} from "./alerts";
import type { WeatherAlertGeometry } from "./types";

function feature(overrides: Partial<EcccAlertFeature["properties"]> = {}, geometry: EcccAlertFeature["geometry"] = null): EcccAlertFeature {
  return {
    id: "alert-1",
    type: "Feature",
    geometry,
    properties: {
      alert_type: "warning",
      alert_name_en: "snowfall warning",
      alert_text_en: "Heavy snow expected.",
      risk_colour_en: "red",
      publication_datetime: "2026-09-24T10:00:00.000Z",
      validity_datetime: "2026-09-24T10:00:00.000Z",
      expiration_datetime: "2026-09-25T10:00:00.000Z",
      feature_name_en: "Metro Vancouver",
      province: "BC",
      status_en: "alert",
      ...overrides,
    },
  };
}

// A simple square around Metro Vancouver: lon -123.3..-122.6, lat 49.0..49.4.
const METRO_VANCOUVER_SQUARE: number[][] = [
  [-123.3, 49.0],
  [-122.6, 49.0],
  [-122.6, 49.4],
  [-123.3, 49.4],
  [-123.3, 49.0],
];

describe("ecccFeatureToWeatherAlert", () => {
  it("maps the fields WinterRoute uses", () => {
    const alert = ecccFeatureToWeatherAlert(feature());
    expect(alert).toEqual({
      provider: "eccc",
      id: "alert-1",
      alertType: "warning",
      title: "snowfall warning",
      summary: "Heavy snow expected.",
      severityColor: "red",
      issuedAt: new Date("2026-09-24T10:00:00.000Z"),
      effectiveAt: new Date("2026-09-24T10:00:00.000Z"),
      expiresAt: new Date("2026-09-25T10:00:00.000Z"),
      areaName: "Metro Vancouver",
      province: "BC",
      geometry: undefined,
    });
  });

  it("normalizes alert_type case/wording into the fixed WeatherAlertType set", () => {
    expect(ecccFeatureToWeatherAlert(feature({ alert_type: "advisory" }))?.alertType).toBe("advisory");
    expect(ecccFeatureToWeatherAlert(feature({ alert_type: "watch" }))?.alertType).toBe("watch");
    expect(ecccFeatureToWeatherAlert(feature({ alert_type: "statement" }))?.alertType).toBe("statement");
    expect(ecccFeatureToWeatherAlert(feature({ alert_type: "something-new" }))?.alertType).toBe("unknown");
  });

  it("returns null when there's no title to represent", () => {
    expect(ecccFeatureToWeatherAlert(feature({ alert_name_en: undefined }))).toBeNull();
  });

  it("extracts Polygon geometry", () => {
    const alert = ecccFeatureToWeatherAlert(
      feature({}, { type: "Polygon", coordinates: [METRO_VANCOUVER_SQUARE] }),
    );
    expect(alert?.geometry).toEqual({ type: "Polygon", coordinates: [METRO_VANCOUVER_SQUARE] });
  });
});

describe("isEcccAlertActive", () => {
  it("treats a normal alert as active", () => {
    expect(isEcccAlertActive(feature(), new Date("2026-09-24T12:00:00Z"))).toBe(true);
  });

  it("treats status_en 'ended' as inactive regardless of dates", () => {
    expect(isEcccAlertActive(feature({ status_en: "ended" }), new Date("2026-09-24T12:00:00Z"))).toBe(false);
  });

  it("treats an alert past its expiration as inactive", () => {
    expect(isEcccAlertActive(feature(), new Date("2026-09-26T00:00:00Z"))).toBe(false);
  });
});

describe("isPointInAlertGeometry", () => {
  const geometry: WeatherAlertGeometry = { type: "Polygon", coordinates: [METRO_VANCOUVER_SQUARE] };

  it("returns true for a point inside the polygon", () => {
    expect(isPointInAlertGeometry({ latitude: 49.28, longitude: -122.92 }, geometry)).toBe(true);
  });

  it("returns false for a point outside the polygon", () => {
    // Toronto — nowhere near the Metro Vancouver square.
    expect(isPointInAlertGeometry({ latitude: 43.65, longitude: -79.38 }, geometry)).toBe(false);
  });

  it("checks every polygon in a MultiPolygon", () => {
    const multi: WeatherAlertGeometry = {
      type: "MultiPolygon",
      coordinates: [[METRO_VANCOUVER_SQUARE]],
    };
    expect(isPointInAlertGeometry({ latitude: 49.28, longitude: -122.92 }, multi)).toBe(true);
  });
});

describe("isAlertRelevantToRoute", () => {
  const geometry: WeatherAlertGeometry = { type: "Polygon", coordinates: [METRO_VANCOUVER_SQUARE] };

  it("is relevant when a route sample point falls inside the alert area", () => {
    const alert = { ...ecccFeatureToWeatherAlert(feature())!, geometry };
    const routePoints = [
      { latitude: 43.65, longitude: -79.38 }, // Toronto — not relevant
      { latitude: 49.28, longitude: -122.92 }, // Burnaby — inside the alert
    ];
    expect(isAlertRelevantToRoute(alert, routePoints)).toBe(true);
  });

  it("is not relevant when no route sample point falls inside the alert area", () => {
    const alert = { ...ecccFeatureToWeatherAlert(feature())!, geometry };
    const routePoints = [{ latitude: 43.65, longitude: -79.38 }]; // Toronto only
    expect(isAlertRelevantToRoute(alert, routePoints)).toBe(false);
  });

  it("is not relevant when the alert has no geometry to check", () => {
    const alert = ecccFeatureToWeatherAlert(feature())!;
    expect(alert.geometry).toBeUndefined();
    expect(isAlertRelevantToRoute(alert, [{ latitude: 49.28, longitude: -122.92 }])).toBe(false);
  });
});

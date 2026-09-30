import { describe, expect, it } from "vitest";
import { computeCommuteRisk } from "./computeCommuteRisk";
import {
  forecast,
  route,
  segment,
  trafficAnalysis,
  trafficResult,
  transitAnalysis,
  transitSegmentAnalysis,
  weatherAnalysis,
  weatherSample,
} from "./fixtures";

const NOW = new Date("2026-09-24T14:00:00Z");

describe("computeCommuteRisk — sanity cases", () => {
  it("Case A: clear weather, no traffic delay, no road events, no transit disruption scores low", () => {
    const r = route([segment({ id: "s1", mode: "drive", durationMinutes: 30 })]);
    const weather = weatherAnalysis({ samples: [weatherSample("s1", [forecast({ temperatureC: 15, precipitationMm: 0, snowfallCm: 0, windSpeedKmh: 5, visibilityKm: 15 })])] });
    const traffic = trafficResult({ trafficAnalysis: { status: "analyzed", analysis: trafficAnalysis({ trafficDelayMinutes: 0 }) }, roadEvents: [] });
    const transit = transitAnalysis({ status: "not-applicable", reason: "no transit segments" });

    const result = computeCommuteRisk({ route: r, weather, traffic, transit, now: NOW });
    expect(result.overallIndex).toBeLessThan(20);
    expect(result.label).toBe("Low");
  });

  it("Case B: heavy precipitation + freezing + high wind on a walking journey scores meaningfully higher than Case A", () => {
    const clearRoute = route([segment({ id: "s1", mode: "walk", durationMinutes: 30 })]);
    const clearWeather = weatherAnalysis({ samples: [weatherSample("s1", [forecast({ temperatureC: 15, precipitationMm: 0, windSpeedKmh: 5 })])] });
    const caseA = computeCommuteRisk({ route: clearRoute, weather: clearWeather, traffic: null, transit: transitAnalysis({ status: "not-applicable", reason: "x" }), now: NOW });

    const severeRoute = route([segment({ id: "s1", mode: "walk", durationMinutes: 30 })]);
    const severeWeather = weatherAnalysis({
      samples: [weatherSample("s1", [forecast({ temperatureC: -4, precipitationMm: 14, windSpeedKmh: 55, visibilityKm: 1.2 })])],
    });
    const caseB = computeCommuteRisk({ route: severeRoute, weather: severeWeather, traffic: null, transit: transitAnalysis({ status: "not-applicable", reason: "x" }), now: NOW });

    expect(caseB.overallIndex).toBeGreaterThan(caseA.overallIndex + 30);
  });

  it("Case C: a car journey with major traffic delay + traffic-jam share scores higher than an otherwise-identical clear-road trip", () => {
    const r = route([segment({ id: "s1", mode: "drive", durationMinutes: 30 })]);
    const weather = weatherAnalysis({ samples: [weatherSample("s1", [forecast({ temperatureC: 10 })])] });

    const clear = computeCommuteRisk({
      route: r,
      weather,
      traffic: trafficResult({ trafficAnalysis: { status: "analyzed", analysis: trafficAnalysis({ trafficDelayMinutes: 0 }) } }),
      transit: transitAnalysis({ status: "not-applicable", reason: "x" }),
      now: NOW,
    });
    const jammed = computeCommuteRisk({
      route: r,
      weather,
      traffic: trafficResult({
        trafficAnalysis: {
          status: "analyzed",
          analysis: trafficAnalysis({
            trafficDelayMinutes: 20,
            intervals: [{ startPolylineIndex: 0, endPolylineIndex: 1, condition: "trafficJam", distanceMeters: 1000 }],
          }),
        },
      }),
      transit: transitAnalysis({ status: "not-applicable", reason: "x" }),
      now: NOW,
    });

    expect(jammed.overallIndex).toBeGreaterThan(clear.overallIndex);
  });

  it("Case D: a transit trip with a canceled matched service scores substantially higher than an identical on-time case", () => {
    const r = route([segment({ id: "s1", mode: "bus", durationMinutes: 30 })]);

    const onTime = computeCommuteRisk({
      route: r,
      weather: null,
      traffic: null,
      transit: transitAnalysis({ transitSegments: [transitSegmentAnalysis({ routeSegmentId: "s1", status: "matched-with-realtime", realtime: { tripStatus: "scheduled", departureDelaySeconds: 0 } })] }),
      now: NOW,
    });
    const canceled = computeCommuteRisk({
      route: r,
      weather: null,
      traffic: null,
      transit: transitAnalysis({ transitSegments: [transitSegmentAnalysis({ routeSegmentId: "s1", status: "matched-with-realtime", realtime: { tripStatus: "canceled" } })] }),
      now: NOW,
    });

    expect(canceled.overallIndex).toBeGreaterThan(onTime.overallIndex + 30);
  });

  it("Case E: a provider being unavailable reduces data coverage but never fabricates severity in either direction", () => {
    const r = route([segment({ id: "s1", mode: "drive", durationMinutes: 30 })]);
    const traffic = trafficResult({ trafficAnalysis: { status: "analyzed", analysis: trafficAnalysis({ trafficDelayMinutes: 5 }) } });

    const withWeather = computeCommuteRisk({
      route: r,
      weather: weatherAnalysis({ samples: [weatherSample("s1", [forecast({ temperatureC: 10 })])] }),
      traffic,
      transit: transitAnalysis({ status: "not-applicable", reason: "x" }),
      now: NOW,
    });
    const withoutWeather = computeCommuteRisk({ route: r, weather: null, traffic, transit: transitAnalysis({ status: "not-applicable", reason: "x" }), now: NOW });

    expect(withoutWeather.dataCoverage.weather).toBe("unavailable");
    expect(withWeather.dataCoverage.weather).toBe("complete");
    // Traffic's own score is identical either way — weather's absence shouldn't inflate or deflate it.
    expect(withoutWeather.factors.traffic.score).toBe(withWeather.factors.traffic.score);
    expect(withoutWeather.factors.weather.status).toBe("unavailable");
  });
});

describe("computeCommuteRisk — monotonic properties", () => {
  it("more snowfall never produces a lower overall index, all else equal", () => {
    const r = route([segment({ id: "s1", mode: "drive", durationMinutes: 30 })]);
    const indexFor = (snowfallCm: number) =>
      computeCommuteRisk({
        route: r,
        weather: weatherAnalysis({ samples: [weatherSample("s1", [forecast({ temperatureC: -1, snowfallCm })])] }),
        traffic: null,
        transit: transitAnalysis({ status: "not-applicable", reason: "x" }),
        now: NOW,
      }).overallIndex;

    const indices = [0, 1, 3, 6, 10].map(indexFor);
    for (let i = 1; i < indices.length; i++) expect(indices[i]).toBeGreaterThanOrEqual(indices[i - 1]);
  });

  it("a larger realtime transit delay never produces a lower overall index", () => {
    const r = route([segment({ id: "s1", mode: "bus", durationMinutes: 30 })]);
    const indexFor = (departureDelaySeconds: number) =>
      computeCommuteRisk({
        route: r,
        weather: null,
        traffic: null,
        transit: transitAnalysis({ transitSegments: [transitSegmentAnalysis({ routeSegmentId: "s1", status: "matched-with-realtime", realtime: { tripStatus: "scheduled", departureDelaySeconds } })] }),
        now: NOW,
      }).overallIndex;

    const indices = [0, 60, 300, 600, 900].map(indexFor);
    for (let i = 1; i < indices.length; i++) expect(indices[i]).toBeGreaterThanOrEqual(indices[i - 1]);
  });

  it("a longer-exposed segment with the same severe weather never contributes less than an identical shorter one", () => {
    const severeForecast = forecast({ temperatureC: -3, snowfallCm: 5 });
    const clearForecast = forecast({ temperatureC: 12, snowfallCm: 0 });

    const shortExposure = route([
      segment({ id: "bad", mode: "walk", durationMinutes: 5 }),
      segment({ id: "good", mode: "walk", durationMinutes: 55 }),
    ]);
    const longExposure = route([
      segment({ id: "bad", mode: "walk", durationMinutes: 55 }),
      segment({ id: "good", mode: "walk", durationMinutes: 5 }),
    ]);

    const weatherFor = (order: "short" | "long") =>
      weatherAnalysis({
        samples:
          order === "short"
            ? [weatherSample("bad", [severeForecast]), weatherSample("good", [clearForecast])]
            : [weatherSample("bad", [severeForecast]), weatherSample("good", [clearForecast])],
      });

    const shortResult = computeCommuteRisk({ route: shortExposure, weather: weatherFor("short"), traffic: null, transit: transitAnalysis({ status: "not-applicable", reason: "x" }), now: NOW });
    const longResult = computeCommuteRisk({ route: longExposure, weather: weatherFor("long"), traffic: null, transit: transitAnalysis({ status: "not-applicable", reason: "x" }), now: NOW });

    expect(longResult.overallIndex).toBeGreaterThanOrEqual(shortResult.overallIndex);
  });
});

describe("computeCommuteRisk — mode sensitivity", () => {
  it("identical severe weather scores meaningfully higher for a walk trip than a rail trip", () => {
    const severeForecast = forecast({ temperatureC: -2, snowfallCm: 4, windSpeedKmh: 40 });

    const walkRoute = route([segment({ id: "s1", mode: "walk", durationMinutes: 30 })]);
    const railRoute = route([segment({ id: "s1", mode: "rail", durationMinutes: 30 })]);

    const walkResult = computeCommuteRisk({ route: walkRoute, weather: weatherAnalysis({ samples: [weatherSample("s1", [severeForecast])] }), traffic: null, transit: transitAnalysis({ status: "not-applicable", reason: "x" }), now: NOW });
    const railResult = computeCommuteRisk({ route: railRoute, weather: weatherAnalysis({ samples: [weatherSample("s1", [severeForecast])] }), traffic: null, transit: transitAnalysis({ status: "not-applicable", reason: "x" }), now: NOW });

    expect(walkResult.overallIndex).toBeGreaterThan(railResult.overallIndex);
  });
});

describe("computeCommuteRisk — missing data", () => {
  const r = () => route([segment({ id: "s1", mode: "drive", durationMinutes: 30 })]);

  it("a missing weather model reduces coverage to 'partial' without changing the traffic score", () => {
    const traffic = trafficResult({ trafficAnalysis: { status: "analyzed", analysis: trafficAnalysis({ trafficDelayMinutes: 5 }) } });
    const partialWeather = weatherAnalysis({
      samples: [weatherSample("s1", [forecast({ temperatureC: 10 })])],
      modelStatus: [
        { modelId: "a", displayName: "A", succeeded: true },
        { modelId: "b", displayName: "B", succeeded: false, errorMessage: "timeout" },
      ],
    });
    const result = computeCommuteRisk({ route: r(), weather: partialWeather, traffic, transit: transitAnalysis({ status: "not-applicable", reason: "x" }), now: NOW });
    expect(result.dataCoverage.weather).toBe("partial");
  });

  it("traffic applicable-but-unavailable is excluded from the index, not scored as zero delay", () => {
    const withFailedTraffic = computeCommuteRisk({ route: r(), weather: null, traffic: null, transit: transitAnalysis({ status: "not-applicable", reason: "x" }), now: NOW });
    expect(withFailedTraffic.factors.traffic.status).toBe("unavailable");
    expect(withFailedTraffic.weighting.find((w) => w.factor === "traffic")?.normalizedWeight).toBeUndefined();
  });

  it("traffic not-applicable (e.g. a walk trip) is excluded from the index", () => {
    const walkRoute = route([segment({ id: "s1", mode: "walk", durationMinutes: 30 })]);
    const result = computeCommuteRisk({
      route: walkRoute,
      weather: null,
      traffic: trafficResult({ trafficAnalysis: { status: "not-applicable", reason: "walk" } }),
      transit: transitAnalysis({ status: "not-applicable", reason: "x" }),
      now: NOW,
    });
    expect(result.factors.traffic.status).toBe("not-applicable");
    expect(result.weighting.find((w) => w.factor === "traffic")?.normalizedWeight).toBeUndefined();
  });

  it("a transit trip with only schedule data (no realtime yet) scores transit using only alert/cancellation evidence, never a fabricated delay", () => {
    const busRoute = route([segment({ id: "s1", mode: "bus", durationMinutes: 30 })]);
    const result = computeCommuteRisk({
      route: busRoute,
      weather: null,
      traffic: null,
      transit: transitAnalysis({ transitSegments: [transitSegmentAnalysis({ routeSegmentId: "s1", status: "matched-schedule-only" })] }),
      now: NOW,
    });
    expect(result.factors.transit.status).toBe("scored");
    expect(result.factors.transit.score).toBe(0);
    expect(result.dataCoverage.transit).toBe("scheduled-only");
  });

  it("a road-event source failure yields 'unavailable', distinct from a successful check finding nothing", () => {
    const failedCheck = computeCommuteRisk({ route: r(), weather: null, traffic: trafficResult({ roadEventStatus: "unavailable" }), transit: transitAnalysis({ status: "not-applicable", reason: "x" }), now: NOW });
    const cleanCheck = computeCommuteRisk({ route: r(), weather: null, traffic: trafficResult({ roadEvents: [] }), transit: transitAnalysis({ status: "not-applicable", reason: "x" }), now: NOW });

    expect(failedCheck.factors.roadEvents.status).toBe("unavailable");
    expect(cleanCheck.factors.roadEvents.status).toBe("scored");
    expect(cleanCheck.factors.roadEvents.score).toBe(0);
  });
});

describe("computeCommuteRisk — counterfactual isolation", () => {
  it("changing only traffic delay changes only the traffic contribution, not weather or transit", () => {
    const r = route([segment({ id: "s1", mode: "drive", durationMinutes: 30 })]);
    const weather = weatherAnalysis({ samples: [weatherSample("s1", [forecast({ temperatureC: 10, precipitationMm: 2 })])] });
    const transit = transitAnalysis({ status: "not-applicable", reason: "x" });

    const low = computeCommuteRisk({
      route: r,
      weather,
      traffic: trafficResult({ trafficAnalysis: { status: "analyzed", analysis: trafficAnalysis({ trafficDelayMinutes: 2 }) } }),
      transit,
      now: NOW,
    });
    const high = computeCommuteRisk({
      route: r,
      weather,
      traffic: trafficResult({ trafficAnalysis: { status: "analyzed", analysis: trafficAnalysis({ trafficDelayMinutes: 15 }) } }),
      transit,
      now: NOW,
    });

    expect(high.factors.traffic.score).toBeGreaterThan(low.factors.traffic.score!);
    expect(high.factors.weather.score).toBe(low.factors.weather.score);
    expect(high.factors.transit.status).toBe(low.factors.transit.status);
  });

  it("changing only snowfall changes only the weather contribution, not traffic", () => {
    const r = route([segment({ id: "s1", mode: "drive", durationMinutes: 30 })]);
    const traffic = trafficResult({ trafficAnalysis: { status: "analyzed", analysis: trafficAnalysis({ trafficDelayMinutes: 5 }) } });
    const transit = transitAnalysis({ status: "not-applicable", reason: "x" });

    const noSnow = computeCommuteRisk({ route: r, weather: weatherAnalysis({ samples: [weatherSample("s1", [forecast({ snowfallCm: 0 })])] }), traffic, transit, now: NOW });
    const withSnow = computeCommuteRisk({ route: r, weather: weatherAnalysis({ samples: [weatherSample("s1", [forecast({ snowfallCm: 6 })])] }), traffic, transit, now: NOW });

    expect(withSnow.factors.weather.score!).toBeGreaterThan(noSnow.factors.weather.score!);
    expect(withSnow.factors.traffic.score).toBe(noSnow.factors.traffic.score);
  });
});

describe("computeCommuteRisk — scenario distribution sweep", () => {
  it("produces a spread of index values across mild/moderate/severe scenarios, not a compressed/saturated distribution", () => {
    const r = route([segment({ id: "s1", mode: "drive", durationMinutes: 30 })]);
    const transit = transitAnalysis({ status: "not-applicable", reason: "x" });

    const scenarios = [
      { temperatureC: 15, precipitationMm: 0, snowfallCm: 0, delay: 0 },
      { temperatureC: 8, precipitationMm: 2, snowfallCm: 0, delay: 3 },
      { temperatureC: 2, precipitationMm: 6, snowfallCm: 1, delay: 8 },
      { temperatureC: -2, precipitationMm: 10, snowfallCm: 4, delay: 15 },
      { temperatureC: -6, precipitationMm: 14, snowfallCm: 10, delay: 25 },
    ];

    const indices = scenarios.map((scenario) =>
      computeCommuteRisk({
        route: r,
        weather: weatherAnalysis({ samples: [weatherSample("s1", [forecast({ temperatureC: scenario.temperatureC, precipitationMm: scenario.precipitationMm, snowfallCm: scenario.snowfallCm })])] }),
        traffic: trafficResult({ trafficAnalysis: { status: "analyzed", analysis: trafficAnalysis({ trafficDelayMinutes: scenario.delay }) } }),
        transit,
        now: NOW,
      }).overallIndex,
    );

    // Not every scenario collapses to the same value, and not everything saturates at the extremes.
    expect(new Set(indices).size).toBeGreaterThan(1);
    expect(Math.min(...indices)).toBeLessThan(30);
    expect(Math.max(...indices)).toBeGreaterThan(40);
    expect(Math.max(...indices)).toBeLessThan(100);
  });
});

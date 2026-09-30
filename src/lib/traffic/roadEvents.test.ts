import { describe, expect, it } from "vitest";
import type { Open511Event } from "./providers/driveBC";
import {
  ROAD_EVENT_PROXIMITY_METERS,
  isEventNearRoute,
  matchEventTime,
  open511EventToRoadEvent,
  selectRelevantRoadEvents,
} from "./roadEvents";
import type { RoadEventGeometry } from "./types";

// DST-aware local-time parsing itself is tested in
// lib/time/vancouverTime.test.ts, where the shared implementation lives.

function baseEvent(overrides: Partial<Open511Event> = {}): Open511Event {
  return {
    id: "drivebc.ca/TEST-1",
    headline: "CONSTRUCTION",
    status: "ACTIVE",
    created: "2026-09-02T15:55:41-07:00",
    updated: "2026-09-02T15:55:41-07:00",
    description: "Test event",
    event_type: "CONSTRUCTION",
    severity: "MINOR",
    geography: { type: "Point", coordinates: [-122.92, 49.28] },
    roads: [{ name: "Test Road", direction: "BOTH" }],
    ...overrides,
  };
}

describe("matchEventTime", () => {
  it("returns 'unknown' when there's no schedule data", () => {
    const event = baseEvent({ schedule: undefined });
    expect(matchEventTime(event, new Date("2026-09-24T16:00:00Z"))).toBe("unknown");
  });

  it("returns 'overlaps' when the trip time falls within the event's interval", () => {
    const event = baseEvent({ schedule: { intervals: ["2026-09-24T08:00/2026-09-24T18:00"] } });
    // 10:00 PDT = 17:00 UTC, within 08:00-18:00 PDT.
    expect(matchEventTime(event, new Date("2026-09-24T17:00:00Z"))).toBe("overlaps");
  });

  it("returns 'no-overlap' when the trip time falls outside the event's interval", () => {
    // Construction starting tomorrow 9pm; trip is tomorrow 8am — should not overlap.
    const event = baseEvent({ schedule: { intervals: ["2026-09-25T21:00/2026-09-26T06:00"] } });
    const tripTime = new Date("2026-09-25T15:00:00Z"); // 8am PDT
    expect(matchEventTime(event, tripTime)).toBe("no-overlap");
  });

  it("checks all intervals when an event has more than one", () => {
    const event = baseEvent({
      schedule: { intervals: ["2026-09-20T00:00/2026-09-21T00:00", "2026-09-24T08:00/2026-09-24T18:00"] },
    });
    expect(matchEventTime(event, new Date("2026-09-24T17:00:00Z"))).toBe("overlaps");
  });
});

describe("isEventNearRoute", () => {
  const routePath = [
    { latitude: 49.28, longitude: -122.92 },
    { latitude: 49.2827, longitude: -123.1207 },
  ];

  it("returns true for an event point within the proximity threshold", () => {
    const geometry: RoadEventGeometry = { type: "Point", coordinates: [-122.9201, 49.2801] };
    expect(isEventNearRoute(geometry, routePath)).toBe(true);
  });

  it("returns false for an event point far from the route", () => {
    const geometry: RoadEventGeometry = { type: "Point", coordinates: [-79.38, 43.65] }; // Toronto
    expect(isEventNearRoute(geometry, routePath)).toBe(false);
  });

  it("respects a custom threshold", () => {
    // ~1km away — inside a 2000m threshold, outside the default 300m one.
    const geometry: RoadEventGeometry = { type: "Point", coordinates: [-122.9085, 49.28] };
    expect(isEventNearRoute(geometry, routePath, ROAD_EVENT_PROXIMITY_METERS)).toBe(false);
    expect(isEventNearRoute(geometry, routePath, 2000)).toBe(true);
  });

  it("checks every point of a LineString geometry", () => {
    const geometry: RoadEventGeometry = {
      type: "LineString",
      coordinates: [
        [-79.38, 43.65], // Toronto — far
        [-122.9201, 49.2801], // near the route
      ],
    };
    expect(isEventNearRoute(geometry, routePath)).toBe(true);
  });
});

describe("open511EventToRoadEvent", () => {
  it("maps the fields WinterRoute uses", () => {
    const event = baseEvent();
    const result = open511EventToRoadEvent(event, new Date("2026-09-24T16:00:00Z"));
    expect(result).toMatchObject({
      provider: "drivebc",
      id: "drivebc.ca/TEST-1",
      eventType: "construction",
      headline: "CONSTRUCTION",
      severity: "minor",
      roadName: "Test Road",
      roadDirection: "BOTH",
    });
  });

  it("preserves direction as informational metadata only (no filtering by it)", () => {
    const event = baseEvent({ roads: [{ name: "Hwy 1", direction: "NB" }] });
    const result = open511EventToRoadEvent(event, new Date("2026-09-24T16:00:00Z"));
    expect(result?.roadDirection).toBe("NB");
  });

  it("returns null when there's no headline to represent", () => {
    const event = baseEvent({ headline: undefined });
    expect(open511EventToRoadEvent(event, new Date())).toBeNull();
  });

  it("normalizes an unrecognized event_type to 'unknown' rather than throwing", () => {
    const event = baseEvent({ event_type: "SOMETHING_NEW" });
    expect(open511EventToRoadEvent(event, new Date())?.eventType).toBe("unknown");
  });
});

describe("selectRelevantRoadEvents", () => {
  const routePath = [
    { latitude: 49.28, longitude: -122.92 },
    { latitude: 49.2827, longitude: -123.1207 },
  ];
  const tripTime = new Date("2026-09-24T17:00:00Z");

  it("excludes an event outside the route's proximity buffer", () => {
    const events = [baseEvent({ geography: { type: "Point", coordinates: [-79.38, 43.65] } })];
    expect(selectRelevantRoadEvents(events, routePath, tripTime)).toHaveLength(0);
  });

  it("includes an event inside the route's proximity buffer", () => {
    const events = [baseEvent({ geography: { type: "Point", coordinates: [-122.9201, 49.2801] } })];
    expect(selectRelevantRoadEvents(events, routePath, tripTime)).toHaveLength(1);
  });

  it("excludes a spatially-relevant event whose schedule confirms no overlap with the trip time", () => {
    const events = [
      baseEvent({
        geography: { type: "Point", coordinates: [-122.9201, 49.2801] },
        schedule: { intervals: ["2026-09-25T21:00/2026-09-26T06:00"] },
      }),
    ];
    expect(selectRelevantRoadEvents(events, routePath, tripTime)).toHaveLength(0);
  });

  it("includes a spatially-relevant event with unknown timing, flagged as such", () => {
    const events = [
      baseEvent({ geography: { type: "Point", coordinates: [-122.9201, 49.2801] }, schedule: undefined }),
    ];
    const result = selectRelevantRoadEvents(events, routePath, tripTime);
    expect(result).toHaveLength(1);
    expect(result[0].timeRelevance).toBe("unknown");
  });

  it("excludes an event with no usable geometry rather than assuming it's relevant", () => {
    const events = [baseEvent({ geography: undefined })];
    expect(selectRelevantRoadEvents(events, routePath, tripTime)).toHaveLength(0);
  });

  it("handles a malformed/empty event list without throwing", () => {
    expect(selectRelevantRoadEvents([], routePath, tripTime)).toEqual([]);
  });
});

import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchServiceAlerts,
  fetchTripUpdates,
  fetchVehiclePositions,
  TranslinkRealtimeRequestError,
} from "./translinkRealtime";

const { transit_realtime } = GtfsRealtimeBindings;

function mockFetchOnce(body: Uint8Array, ok = true, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      status,
      arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
      headers: { get: () => "application/octet-stream" },
    }),
  );
}

beforeEach(() => {
  process.env.TRANSLINK_API_KEY = "test-key";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.TRANSLINK_API_KEY;
});

describe("fetchTripUpdates", () => {
  it("decodes a scheduled trip with a delay and no schedule-relationship overrides", async () => {
    const feed = transit_realtime.FeedMessage.encode({
      header: { gtfsRealtimeVersion: "2.0", timestamp: 1_000_000 },
      entity: [
        {
          id: "e1",
          tripUpdate: {
            trip: { tripId: "T1", routeId: "R1", startDate: "20260926", scheduleRelationship: 0 },
            stopTimeUpdate: [
              {
                stopSequence: 3,
                stopId: "S1",
                arrival: { delay: 120, time: 1_000_060 },
                departure: { delay: 90, time: 1_000_090 },
              },
            ],
          },
        },
      ],
    }).finish();

    mockFetchOnce(feed);
    const result = await fetchTripUpdates();

    expect(result.headerTimestamp).toEqual(new Date(1_000_000 * 1000));
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]).toMatchObject({ tripId: "T1", routeId: "R1", scheduleRelationship: "SCHEDULED" });
    expect(result.entities[0].stopTimeUpdates[0]).toMatchObject({
      stopSequence: 3,
      stopId: "S1",
      scheduleRelationship: "SCHEDULED",
      arrivalDelaySeconds: 120,
      departureDelaySeconds: 90,
    });
    expect(result.entities[0].stopTimeUpdates[0].arrivalTime).toEqual(new Date(1_000_060 * 1000));
  });

  it("decodes a CANCELED trip", async () => {
    const feed = transit_realtime.FeedMessage.encode({
      header: { gtfsRealtimeVersion: "2.0" },
      entity: [
        {
          id: "e1",
          tripUpdate: { trip: { tripId: "T1", scheduleRelationship: 3 }, stopTimeUpdate: [] },
        },
      ],
    }).finish();

    mockFetchOnce(feed);
    const result = await fetchTripUpdates();
    expect(result.entities[0].scheduleRelationship).toBe("CANCELED");
  });

  it("decodes a SKIPPED stop within an otherwise scheduled trip", async () => {
    const feed = transit_realtime.FeedMessage.encode({
      header: { gtfsRealtimeVersion: "2.0" },
      entity: [
        {
          id: "e1",
          tripUpdate: {
            trip: { tripId: "T1", scheduleRelationship: 0 },
            stopTimeUpdate: [{ stopSequence: 1, stopId: "S1", scheduleRelationship: 1 }],
          },
        },
      ],
    }).finish();

    mockFetchOnce(feed);
    const result = await fetchTripUpdates();
    expect(result.entities[0].stopTimeUpdates[0].scheduleRelationship).toBe("SKIPPED");
  });

  it("leaves delay/time fields undefined when genuinely absent from the wire, rather than defaulting to zero", async () => {
    const feed = transit_realtime.FeedMessage.encode({
      header: { gtfsRealtimeVersion: "2.0" },
      entity: [
        {
          id: "e1",
          tripUpdate: {
            trip: { tripId: "T1", scheduleRelationship: 0 },
            stopTimeUpdate: [{ stopSequence: 1, stopId: "S1" }],
          },
        },
      ],
    }).finish();

    mockFetchOnce(feed);
    const result = await fetchTripUpdates();
    const stop = result.entities[0].stopTimeUpdates[0];
    expect(stop.arrivalDelaySeconds).toBeUndefined();
    expect(stop.arrivalTime).toBeUndefined();
    expect(stop.departureDelaySeconds).toBeUndefined();
  });

  it("ignores entities with no tripUpdate (defensive against malformed/partial data)", async () => {
    const feed = transit_realtime.FeedMessage.encode({
      header: { gtfsRealtimeVersion: "2.0" },
      entity: [{ id: "e1" }],
    }).finish();

    mockFetchOnce(feed);
    const result = await fetchTripUpdates();
    expect(result.entities).toEqual([]);
  });

  it("throws TranslinkRealtimeRequestError on a non-ok response, without leaking the api key", async () => {
    mockFetchOnce(new Uint8Array(), false, 503);
    await expect(fetchTripUpdates()).rejects.toThrow(TranslinkRealtimeRequestError);
    try {
      await fetchTripUpdates();
    } catch (error) {
      expect(String(error)).not.toContain("test-key");
    }
  });
});

describe("fetchVehiclePositions", () => {
  it("decodes a vehicle position with all optional fields present", async () => {
    const feed = transit_realtime.FeedMessage.encode({
      header: { gtfsRealtimeVersion: "2.0" },
      entity: [
        {
          id: "v1",
          vehicle: {
            trip: { tripId: "T1", routeId: "R1" },
            vehicle: { id: "V1" },
            position: { latitude: 49.28, longitude: -123.1 },
            currentStopSequence: 4,
            currentStatus: 2,
            timestamp: 1_000_000,
          },
        },
      ],
    }).finish();

    mockFetchOnce(feed);
    const result = await fetchVehiclePositions();
    expect(result.entities[0]).toMatchObject({
      tripId: "T1",
      routeId: "R1",
      vehicleId: "V1",
      currentStopSequence: 4,
      currentStatus: "IN_TRANSIT_TO",
    });
    // Position lat/lng are `float` (32-bit) in the GTFS-RT proto, so a
    // round-trip through encode/decode loses some precision — real,
    // expected behavior of the wire format, not a bug in our decoding.
    expect(result.entities[0].latitude).toBeCloseTo(49.28, 4);
    expect(result.entities[0].longitude).toBeCloseTo(-123.1, 4);
    expect(result.entities[0].observedAt).toEqual(new Date(1_000_000 * 1000));
  });

  it("skips a vehicle entity with no position (nothing usable to place it)", async () => {
    const feed = transit_realtime.FeedMessage.encode({
      header: { gtfsRealtimeVersion: "2.0" },
      entity: [{ id: "v1", vehicle: { trip: { tripId: "T1" } } }],
    }).finish();

    mockFetchOnce(feed);
    const result = await fetchVehiclePositions();
    expect(result.entities).toEqual([]);
  });

  it("leaves observedAt undefined when no timestamp is present, rather than assuming 'now'", async () => {
    const feed = transit_realtime.FeedMessage.encode({
      header: { gtfsRealtimeVersion: "2.0" },
      entity: [{ id: "v1", vehicle: { position: { latitude: 1, longitude: 2 } } }],
    }).finish();

    mockFetchOnce(feed);
    const result = await fetchVehiclePositions();
    expect(result.entities[0].observedAt).toBeUndefined();
  });
});

describe("fetchServiceAlerts", () => {
  it("decodes an alert with cause, effect, translated text, active period, and informed entities", async () => {
    const feed = transit_realtime.FeedMessage.encode({
      header: { gtfsRealtimeVersion: "2.0" },
      entity: [
        {
          id: "a1",
          alert: {
            cause: 10, // CONSTRUCTION
            effect: 6, // MODIFIED_SERVICE
            headerText: { translation: [{ text: "Delays expected", language: "en" }] },
            descriptionText: { translation: [{ text: "Details here", language: "en" }] },
            activePeriod: [{ start: 1_000_000, end: 2_000_000 }],
            informedEntity: [{ agencyId: "TL", routeId: "R1", stopId: "S1" }],
          },
        },
      ],
    }).finish();

    mockFetchOnce(feed);
    const result = await fetchServiceAlerts();
    expect(result.entities[0]).toMatchObject({
      id: "a1",
      cause: "CONSTRUCTION",
      effect: "MODIFIED_SERVICE",
      headerText: "Delays expected",
      descriptionText: "Details here",
    });
    expect(result.entities[0].activePeriods[0]).toEqual({
      start: new Date(1_000_000 * 1000),
      end: new Date(2_000_000 * 1000),
    });
    expect(result.entities[0].informedEntities[0]).toMatchObject({ agencyId: "TL", routeId: "R1", stopId: "S1" });
  });

  it("leaves an open-ended active period's end undefined rather than assuming one", async () => {
    const feed = transit_realtime.FeedMessage.encode({
      header: { gtfsRealtimeVersion: "2.0" },
      entity: [{ id: "a1", alert: { activePeriod: [{ start: 1_000_000 }], informedEntity: [] } }],
    }).finish();

    mockFetchOnce(feed);
    const result = await fetchServiceAlerts();
    expect(result.entities[0].activePeriods[0]).toEqual({ start: new Date(1_000_000 * 1000), end: undefined });
  });
});

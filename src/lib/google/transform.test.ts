import { describe, expect, it } from "vitest";
import type { ResolvedLocation } from "@/lib/route/types";
import type { GoogleComputeRoutesResult, GoogleRouteStep } from "./routes";
import type { GooglePlaceDetails } from "./places";
import {
  buildRouteFromGoogleResult,
  buildSegmentsFromGoogleSteps,
  googlePlaceDetailsToResolvedLocation,
  mapTransitVehicleTypeToSegmentMode,
  transportModeToGoogleRequest,
} from "./transform";

const ORIGIN: ResolvedLocation = { label: "SFU Burnaby", latitude: 49.2781, longitude: -122.9199 };
const DESTINATION: ResolvedLocation = {
  label: "Downtown Vancouver",
  latitude: 49.2827,
  longitude: -123.1207,
};

function driveStep(distanceMeters: number, staticDurationSeconds: number): GoogleRouteStep {
  const startLocation = { latitude: 49.28, longitude: -122.92 };
  const endLocation = { latitude: 49.28, longitude: -122.93 };
  return {
    travelMode: "DRIVE",
    distanceMeters,
    staticDurationSeconds,
    startLocation,
    endLocation,
    polyline: [startLocation, endLocation],
  };
}

function walkStep(distanceMeters: number, staticDurationSeconds: number): GoogleRouteStep {
  const startLocation = { latitude: 49.279, longitude: -122.92 };
  const endLocation = { latitude: 49.2799, longitude: -122.9201 };
  return {
    travelMode: "WALK",
    distanceMeters,
    staticDurationSeconds,
    startLocation,
    endLocation,
    polyline: [startLocation, endLocation],
  };
}

function transitStep(params: {
  vehicleType: string;
  lineName: string;
  lineNameShort?: string;
  headsign?: string;
  agencyName?: string;
  departureStopName: string;
  departureTime: string;
  arrivalStopName: string;
  arrivalTime: string;
  distanceMeters?: number;
  staticDurationSeconds?: number;
}): GoogleRouteStep {
  return {
    travelMode: "TRANSIT",
    distanceMeters: params.distanceMeters ?? 5000,
    staticDurationSeconds: params.staticDurationSeconds ?? 600,
    startLocation: { latitude: 49.28, longitude: -122.92 },
    endLocation: { latitude: 49.286, longitude: -123.118 },
    polyline: [
      { latitude: 49.28, longitude: -122.92 },
      { latitude: 49.286, longitude: -123.118 },
    ],
    transitDetails: {
      vehicleType: params.vehicleType,
      lineName: params.lineName,
      lineNameShort: params.lineNameShort ?? "",
      headsign: params.headsign ?? "",
      agencyName: params.agencyName ?? "TransLink",
      departureStopName: params.departureStopName,
      departureStopLocation: { latitude: 49.28, longitude: -122.92 },
      departureTime: params.departureTime,
      arrivalStopName: params.arrivalStopName,
      arrivalStopLocation: { latitude: 49.286, longitude: -123.118 },
      arrivalTime: params.arrivalTime,
    },
  };
}

describe("transportModeToGoogleRequest", () => {
  it("maps walk/car/cycle to their Google travel modes with no transit preference", () => {
    expect(transportModeToGoogleRequest("walk")).toEqual({ travelMode: "WALK" });
    expect(transportModeToGoogleRequest("car")).toEqual({ travelMode: "DRIVE" });
    expect(transportModeToGoogleRequest("cycle")).toEqual({ travelMode: "BICYCLE" });
  });

  it("maps bus to TRANSIT with a BUS preference", () => {
    expect(transportModeToGoogleRequest("bus")).toEqual({
      travelMode: "TRANSIT",
      transitAllowedTravelModes: ["BUS"],
    });
  });

  it("maps train to TRANSIT with a RAIL preference", () => {
    expect(transportModeToGoogleRequest("train")).toEqual({
      travelMode: "TRANSIT",
      transitAllowedTravelModes: ["RAIL"],
    });
  });
});

describe("googlePlaceDetailsToResolvedLocation", () => {
  it("maps a Place Details response into a ResolvedLocation", () => {
    const details: GooglePlaceDetails = {
      id: "place-sfu",
      displayNameText: "Simon Fraser University",
      formattedAddress: "8888 University Dr W, Burnaby, BC V5A 1S6, Canada",
      location: { latitude: 49.2790886, longitude: -122.9201795 },
      addressComponents: [],
    };

    expect(googlePlaceDetailsToResolvedLocation(details)).toEqual({
      label: "Simon Fraser University",
      latitude: 49.2790886,
      longitude: -122.9201795,
      provider: "google-places",
      providerPlaceId: "place-sfu",
    });
  });

  it("falls back to the formatted address when there's no display name", () => {
    const details: GooglePlaceDetails = {
      id: "place-x",
      displayNameText: "",
      formattedAddress: "123 Main St, Vancouver, BC, Canada",
      location: { latitude: 49.28, longitude: -123.1 },
      addressComponents: [],
    };
    expect(googlePlaceDetailsToResolvedLocation(details).label).toBe(
      "123 Main St, Vancouver, BC, Canada",
    );
  });
});

describe("mapTransitVehicleTypeToSegmentMode", () => {
  it.each(["BUS", "INTERCITY_BUS", "TROLLEYBUS"])("maps %s to bus", (type) => {
    expect(mapTransitVehicleTypeToSegmentMode(type)).toBe("bus");
  });

  it.each(["SUBWAY", "TRAIN", "LIGHT_RAIL", "RAIL", "HEAVY_RAIL", "COMMUTER_TRAIN", "MONORAIL", "TRAM"])(
    "maps %s to rail",
    (type) => {
      expect(mapTransitVehicleTypeToSegmentMode(type)).toBe("rail");
    },
  );

  it("falls back an unrecognized vehicle type to rail rather than throwing", () => {
    expect(mapTransitVehicleTypeToSegmentMode("FERRY")).toBe("rail");
    expect(mapTransitVehicleTypeToSegmentMode("SOMETHING_NEW")).toBe("rail");
  });
});

describe("buildSegmentsFromGoogleSteps — merge rules", () => {
  it("merges consecutive turn-by-turn DRIVE steps into a single segment", () => {
    const steps = [driveStep(252, 44), driveStep(1470, 148), driveStep(331, 27)];
    const segments = buildSegmentsFromGoogleSteps(steps, ORIGIN, DESTINATION);

    expect(segments).toHaveLength(1);
    expect(segments[0].mode).toBe("drive");
    expect(segments[0].start).toEqual(ORIGIN);
    expect(segments[0].end).toEqual(DESTINATION);
    expect(segments[0].distanceMeters).toBe(252 + 1470 + 331);
    expect(segments[0].durationMinutes).toBe(Math.round((44 + 148 + 27) / 60));
  });

  it("merges surrounding WALK steps but keeps the TRANSIT step distinct, using stop names as boundaries", () => {
    // Modeled directly on a real observed response: WALK, WALK, TRANSIT(bus), WALK x5.
    const steps: GoogleRouteStep[] = [
      walkStep(139, 102),
      walkStep(195, 176),
      transitStep({
        vehicleType: "BUS",
        lineName: "Hastings St",
        departureStopName: "SFU Transportation Centre @ Bay 1",
        departureTime: "2026-09-23T23:16:13Z",
        arrivalStopName: "Burrard @ Bay 6",
        arrivalTime: "2026-09-24T00:12:00Z",
        distanceMeters: 16525,
        staticDurationSeconds: 3347,
      }),
      walkStep(94, 77),
      walkStep(342, 342),
      walkStep(82, 68),
      walkStep(71, 60),
      walkStep(25, 21),
    ];

    const segments = buildSegmentsFromGoogleSteps(steps, ORIGIN, DESTINATION);

    expect(segments.map((s) => s.mode)).toEqual(["walk", "bus", "walk"]);

    // First walk segment: origin -> the bus's departure stop.
    expect(segments[0].start).toEqual(ORIGIN);
    expect(segments[0].end).toEqual({
      label: "SFU Transportation Centre @ Bay 1",
      latitude: 49.28,
      longitude: -122.92,
    });
    expect(segments[0].distanceMeters).toBe(139 + 195);

    // Bus segment carries Google's real schedule times directly.
    expect(segments[1].startTime).toEqual(new Date("2026-09-23T23:16:13Z"));
    expect(segments[1].endTime).toEqual(new Date("2026-09-24T00:12:00Z"));
    expect(segments[1].start.label).toBe("SFU Transportation Centre @ Bay 1");
    expect(segments[1].end.label).toBe("Burrard @ Bay 6");

    // Final walk segment: the bus's arrival stop -> destination.
    expect(segments[2].start).toEqual({
      label: "Burrard @ Bay 6",
      latitude: 49.286,
      longitude: -123.118,
    });
    expect(segments[2].end).toEqual(DESTINATION);
    expect(segments[2].distanceMeters).toBe(94 + 342 + 82 + 71 + 25);
  });

  it("never merges two TRANSIT steps together, even with the same resulting segment mode (a transfer)", () => {
    const steps: GoogleRouteStep[] = [
      transitStep({
        vehicleType: "BUS",
        lineName: "R5",
        departureStopName: "Stop A",
        departureTime: "2026-09-23T23:00:00Z",
        arrivalStopName: "Stop B",
        arrivalTime: "2026-09-23T23:20:00Z",
      }),
      transitStep({
        vehicleType: "BUS",
        lineName: "99 B-Line",
        departureStopName: "Stop B",
        departureTime: "2026-09-23T23:22:00Z",
        arrivalStopName: "Stop C",
        arrivalTime: "2026-09-23T23:40:00Z",
      }),
    ];

    const segments = buildSegmentsFromGoogleSteps(steps, ORIGIN, DESTINATION);

    // Two distinct bus rides, not one merged segment — a transfer is a real
    // event (different line, real wait time) even though both legs map to
    // the same SegmentTransportMode.
    expect(segments).toHaveLength(2);
    expect(segments[0].end.label).toBe("Stop B");
    expect(segments[1].start.label).toBe("Stop B");
    expect(segments[0].endTime).toEqual(new Date("2026-09-23T23:20:00Z"));
    expect(segments[1].startTime).toEqual(new Date("2026-09-23T23:22:00Z"));
  });
});


describe("buildRouteFromGoogleResult", () => {
  it("assembles route-level fields from the Google result and segments", () => {
    const googleResult: GoogleComputeRoutesResult = {
      distanceMeters: 18554,
      staticDurationSeconds: 2132,
      steps: [driveStep(18554, 2132)],
      warnings: [],
    };

    const route = buildRouteFromGoogleResult({
      googleResult,
      origin: ORIGIN,
      destination: DESTINATION,
      knownDepartureTime: new Date("2026-09-24T08:00:00Z"),
    });

    expect(route.origin).toEqual(ORIGIN);
    expect(route.destination).toEqual(DESTINATION);
    expect(route.baselineDurationMinutes).toBe(Math.round(2132 / 60));
    expect(route.totalDistanceMeters).toBe(18554);
    expect(route.departureTime).toEqual(new Date("2026-09-24T08:00:00Z"));
    expect(route.segments).toHaveLength(1);
  });
});

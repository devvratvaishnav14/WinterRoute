// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { route, segment, transitAnalysis, transitSegmentAnalysis } from "@/lib/scoring/fixtures";
import type { TransitPreviewState } from "@/components/trip/TransitPreview";
import { RouteMap } from "./RouteMap";
import { loadGoogleMaps } from "./googleMapsLoader";

vi.mock("./googleMapsLoader", () => ({ loadGoogleMaps: vi.fn() }));

const ORIGINAL_MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID;

class FakeMap {
  fitBounds = vi.fn();
  setCenter = vi.fn();
  setZoom = vi.fn();
  constructor() {}
}
class FakePolyline {
  setMap = vi.fn();
  addListener = vi.fn();
  setOptions = vi.fn();
  constructor() {
    createdPolylines.push(this);
  }
}
class FakeAdvancedMarkerElement {
  map: unknown;
  title: string;
  position: unknown;
  content: unknown;
  constructor(opts: { map: unknown; title?: string; position?: unknown; content?: unknown }) {
    this.map = opts.map;
    this.title = opts.title ?? "";
    this.position = opts.position;
    this.content = opts.content;
    createdMarkers.push(this);
  }
}
class FakeLatLngBounds {
  constructor(
    public sw: unknown,
    public ne: unknown,
  ) {}
}

let createdMarkers: FakeAdvancedMarkerElement[] = [];
let createdPolylines: FakePolyline[] = [];

function mockGoogleMapsSuccess() {
  vi.mocked(loadGoogleMaps).mockResolvedValue({
    maps: {
      importLibrary: (name: string) => {
        if (name === "maps") return Promise.resolve({ Map: FakeMap, Polyline: FakePolyline } as never);
        if (name === "marker") return Promise.resolve({ AdvancedMarkerElement: FakeAdvancedMarkerElement } as never);
        if (name === "core") return Promise.resolve({ LatLngBounds: FakeLatLngBounds } as never);
        throw new Error(`unexpected library ${name}`);
      },
    },
  } as unknown as typeof google);
}

beforeEach(() => {
  createdMarkers = [];
  createdPolylines = [];
  process.env.NEXT_PUBLIC_GOOGLE_MAP_ID = "test-map-id";
});

afterEach(() => {
  cleanup();
  process.env.NEXT_PUBLIC_GOOGLE_MAP_ID = ORIGINAL_MAP_ID;
  vi.clearAllMocks();
});

const carRoute = route([segment({ mode: "drive", geometry: [{ latitude: 49.28, longitude: -123.1 }, { latitude: 49.2, longitude: -123.0 }] })]);

const transitRoute = route([
  segment({ id: "w1", mode: "walk" }),
  segment({ id: "b1", mode: "bus" }),
  segment({ id: "w2", mode: "walk" }),
]);

describe("RouteMap", () => {
  it("shows 'Route map unavailable' when NEXT_PUBLIC_GOOGLE_MAP_ID is missing, without crashing", async () => {
    delete process.env.NEXT_PUBLIC_GOOGLE_MAP_ID;
    render(<RouteMap route={carRoute} />);
    await waitFor(() => expect(screen.getByText("Route map unavailable")).toBeTruthy());
  });

  it("shows 'Route map unavailable' when the Maps API fails to load, without crashing", async () => {
    vi.mocked(loadGoogleMaps).mockRejectedValue(new Error("network error"));
    render(<RouteMap route={carRoute} />);
    await waitFor(() => expect(screen.getByText("Route map unavailable")).toBeTruthy());
  });

  it("renders an accessible map container with the route's origin/destination in its label", async () => {
    mockGoogleMapsSuccess();
    render(<RouteMap route={carRoute} />);
    await waitFor(() => expect(screen.getByRole("img")).toBeTruthy());
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain(carRoute.origin.label);
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain(carRoute.destination.label);
  });

  it("creates exactly two markers (origin, destination) titled with the real location labels", async () => {
    mockGoogleMapsSuccess();
    render(<RouteMap route={carRoute} />);
    await waitFor(() => expect(createdMarkers.length).toBe(2));
    expect(createdMarkers.map((m) => m.title)).toEqual([carRoute.origin.label, carRoute.destination.label]);
  });

  it("still renders successfully for a route with no segment geometry at all (falls back gracefully)", async () => {
    mockGoogleMapsSuccess();
    const noGeometryRoute = route([segment({ mode: "drive", geometry: undefined })]);
    render(<RouteMap route={noGeometryRoute} />);
    await waitFor(() => expect(createdMarkers.length).toBe(2));
  });

  it("shows no legend for a single-mode (all drive) route", async () => {
    mockGoogleMapsSuccess();
    render(<RouteMap route={carRoute} />);
    await waitFor(() => expect(createdMarkers.length).toBe(2));
    expect(screen.queryByText("Bus")).toBeNull();
    expect(screen.queryByText("Drive")).toBeNull();
  });

  it("shows a legend distinguishing walk and bus for a mixed transit route", async () => {
    mockGoogleMapsSuccess();
    render(<RouteMap route={transitRoute} />);
    await waitFor(() => expect(createdMarkers.length).toBe(2));
    expect(screen.getByText("Walk")).toBeTruthy();
    expect(screen.getByText("Bus")).toBeTruthy();
  });

  it("adds a boarding marker for a transit leg with a real matched stop, using its real coordinates", async () => {
    mockGoogleMapsSuccess();
    const transitState: TransitPreviewState = {
      status: "success",
      analysis: transitAnalysis({
        transitSegments: [
          transitSegmentAnalysis({ routeSegmentId: "b1", originStop: { providerStopId: "1", name: "SFU Transportation Centre", latitude: 49.2, longitude: -122.92 } }),
        ],
      }),
    };
    render(<RouteMap route={transitRoute} transitState={transitState} />);
    await waitFor(() => expect(createdMarkers.length).toBe(3)); // origin + destination + 1 boarding marker
    expect(createdMarkers.some((m) => m.title.includes("SFU Transportation Centre"))).toBe(true);
  });

  it("gracefully omits a boarding marker when the transit leg has no matched stop coordinates", async () => {
    mockGoogleMapsSuccess();
    const transitState: TransitPreviewState = {
      status: "success",
      analysis: transitAnalysis({ transitSegments: [transitSegmentAnalysis({ routeSegmentId: "b1", originStop: undefined })] }),
    };
    render(<RouteMap route={transitRoute} transitState={transitState} />);
    await waitFor(() => expect(createdMarkers.length).toBe(2)); // origin + destination only
  });

  it("does not clutter the map with a marker per stop — only real boarding points", async () => {
    mockGoogleMapsSuccess();
    const transitState: TransitPreviewState = {
      status: "success",
      analysis: transitAnalysis({
        transitSegments: [transitSegmentAnalysis({ routeSegmentId: "b1", originStop: { providerStopId: "1", name: "Stop A", latitude: 49.2, longitude: -122.92 } })],
      }),
    };
    render(<RouteMap route={transitRoute} transitState={transitState} />);
    await waitFor(() => expect(createdMarkers.length).toBe(3));
    // Never one marker per intermediate GTFS stop along the line — just origin, destination, and the one boarding point.
    expect(createdMarkers.length).toBeLessThanOrEqual(3);
  });

  it("mutes unselected segments while brightening the highlighted one, and restores full visibility when nothing is selected", async () => {
    mockGoogleMapsSuccess();
    const { rerender } = render(<RouteMap route={transitRoute} highlightedSegmentId={null} />);
    await waitFor(() => expect(createdPolylines.length).toBe(transitRoute.segments.length * 2));

    // transitRoute = [walk(w1), bus(b1), walk(w2)] -> polylines[0..1] = w1's casing/route, [2..3] = b1's, [4..5] = w2's.
    const [w1Casing, , b1Casing, , w2Casing] = createdPolylines;

    rerender(<RouteMap route={transitRoute} highlightedSegmentId="b1" />);
    await waitFor(() => expect(b1Casing.setOptions.mock.calls.length).toBeGreaterThan(0));

    const b1Opacity = b1Casing.setOptions.mock.calls.at(-1)?.[0]?.strokeOpacity;
    const w1Opacity = w1Casing.setOptions.mock.calls.at(-1)?.[0]?.strokeOpacity;
    const w2Opacity = w2Casing.setOptions.mock.calls.at(-1)?.[0]?.strokeOpacity;
    expect(w1Opacity).toBeLessThan(b1Opacity);
    expect(w2Opacity).toBeLessThan(b1Opacity);
    // Muted, not hidden — still greater than zero.
    expect(w1Opacity).toBeGreaterThan(0);

    rerender(<RouteMap route={transitRoute} highlightedSegmentId={null} />);
    await waitFor(() => expect(w1Casing.setOptions.mock.calls.at(-1)?.[0]?.strokeOpacity).toBe(b1Opacity));
  });

  it("restyles the highlighted segment's casing+route polylines without rebuilding the map", async () => {
    mockGoogleMapsSuccess();
    // Each segment now draws TWO polylines (a casing halo + the mode-colored route line).
    const { rerender } = render(<RouteMap route={transitRoute} highlightedSegmentId={null} />);
    await waitFor(() => expect(createdPolylines.length).toBe(transitRoute.segments.length * 2));

    const callCountBefore = createdPolylines.length;
    rerender(<RouteMap route={transitRoute} highlightedSegmentId="b1" />);

    await waitFor(() => expect(createdPolylines.some((p) => p.setOptions.mock.calls.length > 0)).toBe(true));
    // No new polylines created just from a highlight change.
    expect(createdPolylines.length).toBe(callCountBefore);
  });

  describe("previewHandleRef — 'Preview my commute' imperative marker", () => {
    it("populates the ref once the map is ready", async () => {
      mockGoogleMapsSuccess();
      const previewHandleRef = { current: null as import("./RouteMap").RouteMapPreviewHandle | null };
      render(<RouteMap route={carRoute} previewHandleRef={previewHandleRef} />);
      await waitFor(() => expect(previewHandleRef.current).not.toBeNull());
    });

    it("creates exactly one marker on the first setPreviewMarker call, with no new routing request", async () => {
      mockGoogleMapsSuccess();
      const previewHandleRef = { current: null as import("./RouteMap").RouteMapPreviewHandle | null };
      render(<RouteMap route={carRoute} previewHandleRef={previewHandleRef} />);
      await waitFor(() => expect(previewHandleRef.current).not.toBeNull());

      const markersBefore = createdMarkers.length; // origin + destination
      previewHandleRef.current!.setPreviewMarker({ latitude: 49.25, longitude: -123.05 }, "walk");
      expect(createdMarkers.length).toBe(markersBefore + 1);
      expect(loadGoogleMaps).toHaveBeenCalledTimes(1); // only the ONE load, never a second routing/maps call for the preview
    });

    it("moves the SAME marker on subsequent calls rather than creating a new one each time", async () => {
      mockGoogleMapsSuccess();
      const previewHandleRef = { current: null as import("./RouteMap").RouteMapPreviewHandle | null };
      render(<RouteMap route={carRoute} previewHandleRef={previewHandleRef} />);
      await waitFor(() => expect(previewHandleRef.current).not.toBeNull());

      previewHandleRef.current!.setPreviewMarker({ latitude: 49.25, longitude: -123.05 }, "walk");
      const countAfterFirst = createdMarkers.length;
      const marker = createdMarkers.at(-1)!;

      previewHandleRef.current!.setPreviewMarker({ latitude: 49.26, longitude: -123.04 }, "walk");
      expect(createdMarkers.length).toBe(countAfterFirst);
      expect(marker.position).toEqual({ lat: 49.26, lng: -123.04 });
    });

    it("swaps the marker's content when the mode changes (e.g. walk -> bus at a boarding point)", async () => {
      mockGoogleMapsSuccess();
      const previewHandleRef = { current: null as import("./RouteMap").RouteMapPreviewHandle | null };
      render(<RouteMap route={carRoute} previewHandleRef={previewHandleRef} />);
      await waitFor(() => expect(previewHandleRef.current).not.toBeNull());

      previewHandleRef.current!.setPreviewMarker({ latitude: 49.25, longitude: -123.05 }, "walk");
      const marker = createdMarkers.at(-1)!;
      const walkContent = marker.content;

      previewHandleRef.current!.setPreviewMarker({ latitude: 49.25, longitude: -123.05 }, "bus");
      expect(marker.content).not.toBe(walkContent);
    });

    it("removes the marker from the map when called with null", async () => {
      mockGoogleMapsSuccess();
      const previewHandleRef = { current: null as import("./RouteMap").RouteMapPreviewHandle | null };
      render(<RouteMap route={carRoute} previewHandleRef={previewHandleRef} />);
      await waitFor(() => expect(previewHandleRef.current).not.toBeNull());

      previewHandleRef.current!.setPreviewMarker({ latitude: 49.25, longitude: -123.05 }, "walk");
      const marker = createdMarkers.at(-1)!;

      previewHandleRef.current!.setPreviewMarker(null, null);
      expect(marker.map).toBeNull();
    });
  });
});

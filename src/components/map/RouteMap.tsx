"use client";

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type { Route, SegmentTransportMode } from "@/lib/route/types";
import type { TransitPreviewState } from "@/components/trip/TransitPreview";
import { buildPreviewMarkerContent } from "@/components/preview/previewMarkerContent";
import { loadGoogleMaps } from "./googleMapsLoader";
import {
  allRoutePoints,
  boundsFromPoints,
  isDegenerateBounds,
  legendEntriesFor,
  segmentPath,
  styleForMode,
  transitBoardingWaypoints,
} from "./routeMapGeometry";
import { MapLegend } from "./MapLegend";

/**
 * Imperative escape hatch for "Preview my commute" — the preview's
 * animation loop calls `setPreviewMarker` on every tick (see
 * `usePreviewPlayback.ts`) to move a single marker along the ALREADY-
 * RENDERED route, without ever triggering a React re-render of `RouteMap`
 * itself (per "don't update React state every animation frame"). No new
 * Directions/Routes request — this only ever repositions a marker over
 * geometry `RouteMap` already fetched/rendered once.
 */
export interface RouteMapPreviewHandle {
  setPreviewMarker(position: { latitude: number; longitude: number } | null, mode: SegmentTransportMode | null): void;
}

type MapStatus = "loading" | "ready" | "error";

const FIT_BOUNDS_PADDING_PX = 48;
const SHORT_TRIP_ZOOM = 15;
const MUTED_OPACITY_FACTOR = 0.35;

function buildEndpointPin(label: "A" | "B"): HTMLDivElement {
  const el = document.createElement("div");
  el.textContent = label;
  el.style.cssText = [
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "width:26px",
    "height:26px",
    "border-radius:9999px",
    `background:${label === "A" ? "#7fb3ff" : "#ffffff"}`,
    "color:#0b1220",
    "font:700 12px system-ui, sans-serif",
    "border:2px solid rgba(11,18,32,0.55)",
    "box-shadow:0 2px 6px rgba(0,0,0,0.35)",
  ].join(";");
  return el;
}

function buildBoardingPin(label: string): HTMLDivElement {
  const el = document.createElement("div");
  el.textContent = label;
  el.style.cssText = [
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "width:19px",
    "height:19px",
    "border-radius:9999px",
    "background:#0b1220",
    "color:#e7edf7",
    "font:700 10px system-ui, sans-serif",
    "border:1.5px solid rgba(255,255,255,0.6)",
    "box-shadow:0 1px 4px rgba(0,0,0,0.4)",
  ].join(";");
  return el;
}

interface TrackedSegment {
  casing: google.maps.Polyline;
  routeLine: google.maps.Polyline;
  casingOpacity: number;
  routeOpacity: number;
  routeWeight: number;
  routeColor: string;
  dashed: boolean;
}

function dashedIcon(color: string, opacity: number, scale: number): NonNullable<google.maps.PolylineOptions["icons"]> {
  return [{ icon: { path: "M 0,-1 0,1", strokeColor: color, strokeOpacity: opacity, scale }, offset: "0", repeat: "14px" }];
}

/**
 * Renders the ALREADY-COMPUTED WinterRoute `Route` on a Google map — no
 * new Directions/Routes request is ever made from the browser. Google-
 * specific browser code (loading, map/marker/polyline construction)
 * lives entirely in this file and `routeMapGeometry.ts`/
 * `googleMapsLoader.ts`; the rest of the app only ever passes plain
 * domain objects in. See docs/architecture.md "Map visualization
 * architecture."
 */
export function RouteMap({
  route,
  transitState,
  highlightedSegmentId,
  onSelectSegment,
  previewHandleRef,
}: {
  route: Route;
  transitState?: TransitPreviewState | null;
  /** When set, that segment's polyline renders brighter/thicker and every other segment is subtly muted — the map half of the itinerary<->map highlight interaction. */
  highlightedSegmentId?: string | null;
  onSelectSegment?: (segmentId: string) => void;
  /** Populated once the map is ready — see `RouteMapPreviewHandle`. */
  previewHandleRef?: MutableRefObject<RouteMapPreviewHandle | null>;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<MapStatus>("loading");
  const polylinesRef = useRef<Map<string, TrackedSegment>>(new Map());
  const previewMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const previewMarkerModeRef = useRef<SegmentTransportMode | null>(null);
  const legend = legendEntriesFor(route);

  useEffect(() => {
    let cancelled = false;
    const cleanupFns: Array<() => void> = [];
    // No `setStatus("loading")` reset here: `status` already starts at
    // "loading" (see the `useState` above), and in practice this effect
    // only ever runs once per mount — ResultsView (and this component
    // with it) is fully remounted for a new route, never reused in place.

    async function setUp() {
      const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID;
      if (!mapId) {
        if (!cancelled) setStatus("error");
        return;
      }

      const g = await loadGoogleMaps();
      const { Map: GoogleMap, Polyline } = await g.maps.importLibrary("maps");
      const { AdvancedMarkerElement } = await g.maps.importLibrary("marker");
      const { LatLngBounds } = await g.maps.importLibrary("core");

      if (cancelled || !containerRef.current) return;

      const map = new GoogleMap(containerRef.current, {
        mapId,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: "cooperative",
      });

      polylinesRef.current = new Map();
      for (const segment of route.segments) {
        const style = styleForMode(segment.mode);
        const path = segmentPath(segment);

        // The casing (halo) always paints first/below — a solid light
        // stroke under every mode, so the route reads clearly over
        // roads/parks/water/labels regardless of the mode's own color.
        const casing = new Polyline({
          path,
          map,
          strokeColor: style.casingColor,
          strokeOpacity: style.casingOpacity,
          strokeWeight: style.casingWeight,
          zIndex: 1,
        });

        // The mode-colored route line paints on top. For a dashed mode
        // (walk), the polyline's own stroke is invisible (opacity 0) and
        // the visible dashes come entirely from `icons` instead.
        const routeLine = new Polyline({
          path,
          map,
          strokeColor: style.routeColor,
          strokeOpacity: style.dashed ? 0 : style.routeOpacity,
          strokeWeight: style.routeWeight,
          zIndex: 2,
          icons: style.dashed ? dashedIcon(style.routeColor, style.routeOpacity, style.routeWeight / 2) : undefined,
        });

        if (onSelectSegment) {
          casing.addListener("click", () => onSelectSegment(segment.id));
          routeLine.addListener("click", () => onSelectSegment(segment.id));
        }

        polylinesRef.current.set(segment.id, {
          casing,
          routeLine,
          casingOpacity: style.casingOpacity,
          routeOpacity: style.routeOpacity,
          routeWeight: style.routeWeight,
          routeColor: style.routeColor,
          dashed: style.dashed,
        });
        cleanupFns.push(() => {
          casing.setMap(null);
          routeLine.setMap(null);
        });
      }

      const originMarker = new AdvancedMarkerElement({
        map,
        position: { lat: route.origin.latitude, lng: route.origin.longitude },
        title: route.origin.label,
        content: buildEndpointPin("A"),
      });
      const destinationMarker = new AdvancedMarkerElement({
        map,
        position: { lat: route.destination.latitude, lng: route.destination.longitude },
        title: route.destination.label,
        content: buildEndpointPin("B"),
      });
      cleanupFns.push(() => {
        originMarker.map = null;
        destinationMarker.map = null;
      });

      const transitSegments = transitState?.status === "success" && transitState.analysis.status === "analyzed" ? transitState.analysis.transitSegments : [];
      for (const waypoint of transitBoardingWaypoints(route, transitSegments)) {
        const marker = new AdvancedMarkerElement({ map, position: waypoint.position, title: waypoint.title, content: buildBoardingPin(waypoint.label) });
        cleanupFns.push(() => {
          marker.map = null;
        });
      }

      const bounds = boundsFromPoints(allRoutePoints(route));
      if (isDegenerateBounds(bounds)) {
        map.setCenter({ lat: bounds.north, lng: bounds.east });
        map.setZoom(SHORT_TRIP_ZOOM);
      } else {
        map.fitBounds(new LatLngBounds({ lat: bounds.south, lng: bounds.west }, { lat: bounds.north, lng: bounds.east }), FIT_BOUNDS_PADDING_PX);
      }

      if (previewHandleRef) {
        previewHandleRef.current = {
          setPreviewMarker(position, mode) {
            if (!position || !mode) {
              if (previewMarkerRef.current) {
                previewMarkerRef.current.map = null;
                previewMarkerRef.current = null;
                previewMarkerModeRef.current = null;
              }
              return;
            }
            const latLng = { lat: position.latitude, lng: position.longitude };
            if (!previewMarkerRef.current) {
              previewMarkerRef.current = new AdvancedMarkerElement({ map, position: latLng, zIndex: 20, content: buildPreviewMarkerContent(mode) });
              previewMarkerModeRef.current = mode;
              return;
            }
            previewMarkerRef.current.position = latLng;
            if (previewMarkerModeRef.current !== mode) {
              previewMarkerRef.current.content = buildPreviewMarkerContent(mode);
              previewMarkerModeRef.current = mode;
            }
          },
        };
      }

      if (!cancelled) setStatus("ready");
    }

    setUp().catch(() => {
      if (!cancelled) setStatus("error");
    });

    return () => {
      cancelled = true;
      cleanupFns.forEach((fn) => fn());
      if (previewMarkerRef.current) {
        previewMarkerRef.current.map = null;
        previewMarkerRef.current = null;
      }
      if (previewHandleRef) previewHandleRef.current = null;
    };
    // route.segments/origin/destination identity is what actually needs a
    // fresh map — the route object itself is stable per result (re-created
    // only on a new "Check my commute" submit, which unmounts this view).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route]);

  // Restyles existing casing+route polylines in place on highlight
  // change — never rebuilds the map/markers, keeping this lightweight.
  // When nothing is selected, every segment renders at full normal
  // visibility (its own base style, untouched).
  useEffect(() => {
    for (const [segmentId, tracked] of polylinesRef.current) {
      const isHighlighted = highlightedSegmentId === segmentId;
      const isMuted = Boolean(highlightedSegmentId) && !isHighlighted;
      const routeOpacity = isMuted ? tracked.routeOpacity * MUTED_OPACITY_FACTOR : tracked.routeOpacity;
      const routeWeight = isHighlighted ? tracked.routeWeight + 2 : tracked.routeWeight;
      const casingOpacity = isMuted ? tracked.casingOpacity * MUTED_OPACITY_FACTOR : tracked.casingOpacity;

      tracked.casing.setOptions({ strokeOpacity: casingOpacity, zIndex: isHighlighted ? 11 : 1 });
      tracked.routeLine.setOptions({
        strokeOpacity: tracked.dashed ? 0 : routeOpacity,
        strokeWeight: routeWeight,
        zIndex: isHighlighted ? 12 : 2,
        icons: tracked.dashed ? dashedIcon(tracked.routeColor, routeOpacity, routeWeight / 2) : undefined,
      });
    }
  }, [highlightedSegmentId, status]);

  if (status === "error") {
    return (
      <div
        role="status"
        className="flex h-[220px] items-center justify-center rounded-2xl border border-white/15 bg-white/[0.08] text-sm text-white/65 sm:h-[280px]"
      >
        Route map unavailable
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0b1220]">
      <div
        ref={containerRef}
        role="img"
        aria-label={`Map showing the route from ${route.origin.label} to ${route.destination.label}`}
        className="h-[260px] w-full sm:h-[340px] lg:h-[420px]"
      />
      {status === "loading" ? (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-white/40">Loading map…</div>
      ) : null}
      <MapLegend entries={legend} />
    </div>
  );
}

import type { EcccAlertFeature } from "./providers/eccc";
import type { WeatherAlert, WeatherAlertGeometry, WeatherAlertType } from "./types";

function normalizeAlertType(raw: string | undefined): WeatherAlertType {
  const value = (raw ?? "").toLowerCase();
  if (value.includes("warning")) return "warning";
  if (value.includes("watch")) return "watch";
  if (value.includes("advisory")) return "advisory";
  if (value.includes("statement")) return "statement";
  return "unknown";
}

function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function extractGeometry(feature: EcccAlertFeature): WeatherAlertGeometry | undefined {
  const geometry = feature.geometry;
  if (!geometry) return undefined;
  if (geometry.type === "Polygon") {
    return { type: "Polygon", coordinates: geometry.coordinates as number[][][] };
  }
  if (geometry.type === "MultiPolygon") {
    return { type: "MultiPolygon", coordinates: geometry.coordinates as number[][][][] };
  }
  return undefined;
}

/**
 * ECCC's `weather-alerts` collection retains ended/expired records rather
 * than removing them (confirmed against the live API — a real feature
 * returned with `status_en: "ended"` well after its event passed). An
 * alert is only "active" if its status doesn't say otherwise and its
 * expiration hasn't passed.
 */
export function isEcccAlertActive(feature: EcccAlertFeature, now: Date): boolean {
  const status = feature.properties.status_en?.toLowerCase();
  if (status === "ended" || status === "expired") return false;

  const expiresAt = parseDate(feature.properties.expiration_datetime);
  if (expiresAt && expiresAt.getTime() < now.getTime()) return false;

  return true;
}

/** Converts one ECCC feature into WinterRoute's provider-neutral alert shape — only the fields actually used, never a raw CAP payload. */
export function ecccFeatureToWeatherAlert(feature: EcccAlertFeature): WeatherAlert | null {
  const props = feature.properties;
  if (!props.alert_name_en) return null;

  return {
    provider: "eccc",
    id: feature.id,
    alertType: normalizeAlertType(props.alert_type),
    title: props.alert_name_en,
    summary: props.alert_text_en ?? "",
    severityColor: props.risk_colour_en,
    issuedAt: parseDate(props.publication_datetime),
    effectiveAt: parseDate(props.validity_datetime),
    expiresAt: parseDate(props.expiration_datetime),
    areaName: props.feature_name_en,
    province: props.province,
    geometry: extractGeometry(feature),
  };
}

function isPointInRing(point: { latitude: number; longitude: number }, ring: number[][]): boolean {
  // Ray-casting algorithm. Ring points are [longitude, latitude] (GeoJSON order).
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects =
      yi > point.latitude !== yj > point.latitude &&
      point.longitude < ((xj - xi) * (point.latitude - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function isPointInPolygon(point: { latitude: number; longitude: number }, rings: number[][][]): boolean {
  if (rings.length === 0) return false;
  const [outer, ...holes] = rings;
  if (!isPointInRing(point, outer)) return false;
  return !holes.some((hole) => isPointInRing(point, hole));
}

/** Whether `point` falls inside an alert's real affected-area geometry — not a bounding-box approximation. */
export function isPointInAlertGeometry(
  point: { latitude: number; longitude: number },
  geometry: WeatherAlertGeometry,
): boolean {
  if (geometry.type === "Polygon") return isPointInPolygon(point, geometry.coordinates);
  return geometry.coordinates.some((polygon) => isPointInPolygon(point, polygon));
}

/**
 * An alert is only associated with the trip when its real geometry
 * intersects one of the route's own sample points — never "there's an
 * alert somewhere in the province." An alert with no usable geometry is
 * treated as not relevant (rather than assumed relevant), since there's
 * nothing to check it against.
 */
export function isAlertRelevantToRoute(
  alert: WeatherAlert,
  routePoints: Array<{ latitude: number; longitude: number }>,
): boolean {
  if (!alert.geometry) return false;
  return routePoints.some((point) => isPointInAlertGeometry(point, alert.geometry!));
}

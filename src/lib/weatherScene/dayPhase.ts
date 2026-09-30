/**
 * Deterministic day/night derivation for the weather scene, based on the
 * SELECTED commute's location and time — never the viewer's current
 * clock. A standard solar-elevation approximation (declination +
 * equation-of-time + hour angle from longitude), not a lookup against
 * any timezone database and not a hardcoded UTC offset — this is what
 * lets it stay correct for both Vancouver's DST transitions and, in
 * principle, any other location, using only latitude/longitude/instant.
 *
 * Accuracy is on the order of a few minutes around sunrise/sunset,
 * which is more than sufficient for a visual "is it light or dark
 * outside" scene decision — this is not an astronomical/navigation
 * tool.
 */

const DEGREES_PER_RADIAN = 180 / Math.PI;
const RADIANS_PER_DEGREE = Math.PI / 180;

/** The conventional sunrise/sunset solar-elevation threshold (degrees) — accounts for atmospheric refraction and the sun's apparent radius, not the literal geometric horizon (0°). */
const SUNRISE_SUNSET_ELEVATION_DEGREES = -0.833;

function solarElevationDegrees(latitude: number, longitude: number, date: Date): number {
  const startOfYearUtc = Date.UTC(date.getUTCFullYear(), 0, 1);
  const dayOfYear = Math.floor((date.getTime() - startOfYearUtc) / 86_400_000) + 1;

  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;

  const b = RADIANS_PER_DEGREE * (360 / 365) * (dayOfYear - 81);
  const declinationDegrees = 23.44 * Math.sin(b);
  const equationOfTimeMinutes = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);

  const solarTimeHours = utcHours + longitude / 15 + equationOfTimeMinutes / 60;
  const hourAngleDegrees = 15 * (solarTimeHours - 12);

  const latRad = latitude * RADIANS_PER_DEGREE;
  const decRad = declinationDegrees * RADIANS_PER_DEGREE;
  const hourRad = hourAngleDegrees * RADIANS_PER_DEGREE;

  const sinElevation = Math.sin(latRad) * Math.sin(decRad) + Math.cos(latRad) * Math.cos(decRad) * Math.cos(hourRad);
  return Math.asin(Math.max(-1, Math.min(1, sinElevation))) * DEGREES_PER_RADIAN;
}

/** Whether it's effectively daytime at `latitude`/`longitude` at `date` — purely a function of those three inputs, never the caller's current clock. */
export function computeDayPhase(latitude: number, longitude: number, date: Date): "day" | "night" {
  return solarElevationDegrees(latitude, longitude, date) > SUNRISE_SUNSET_ELEVATION_DEGREES ? "day" : "night";
}

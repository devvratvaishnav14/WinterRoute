import JSZip from "jszip";

/**
 * TransLink's official current GTFS static feed — confirmed live (not a
 * guessed historical URL) and documented as updated weekly (Fridays). See
 * docs/data-sources.md.
 */
const GTFS_STATIC_URL = "https://gtfs-static.translink.ca/gtfs/google_transit.zip";

const REQUIRED_ENTRIES = [
  "routes.txt",
  "trips.txt",
  "stops.txt",
  "stop_times.txt",
  "calendar.txt",
  "calendar_dates.txt",
] as const;

export class GtfsStaticDownloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GtfsStaticDownloadError";
  }
}

export interface GtfsStaticRawTables {
  routesText: string;
  tripsText: string;
  stopsText: string;
  /**
   * Kept as raw text, not parsed here — TransLink's real `stop_times.txt`
   * is ~1.84M rows / 91MB uncompressed, too large to justify a persistent
   * parsed-object index for every process. Callers scan it on demand for
   * just the trip IDs they need (`GtfsStaticStore.stopTimesForTrips`) —
   * see docs/architecture.md "GTFS static: eager index vs. lazy scan."
   */
  stopTimesText: string;
  calendarText: string;
  calendarDatesText: string;
  fetchedAt: Date;
}

/** Downloads and unzips TransLink's GTFS static feed. Does not parse the tables — see `GtfsStaticStore`. */
export async function downloadGtfsStatic(signal?: AbortSignal): Promise<GtfsStaticRawTables> {
  const response = await fetch(GTFS_STATIC_URL, { signal });
  if (!response.ok) {
    throw new GtfsStaticDownloadError(`GTFS static download failed (${response.status})`);
  }

  const buffer = await response.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);

  const readEntry = async (name: string): Promise<string> => {
    const entry = zip.file(name);
    if (!entry) {
      throw new GtfsStaticDownloadError(`GTFS static feed is missing required file: ${name}`);
    }
    return entry.async("string");
  };

  for (const required of REQUIRED_ENTRIES) {
    if (!zip.file(required)) {
      throw new GtfsStaticDownloadError(`GTFS static feed is missing required file: ${required}`);
    }
  }

  const [routesText, tripsText, stopsText, stopTimesText, calendarText, calendarDatesText] = await Promise.all([
    readEntry("routes.txt"),
    readEntry("trips.txt"),
    readEntry("stops.txt"),
    readEntry("stop_times.txt"),
    readEntry("calendar.txt"),
    readEntry("calendar_dates.txt"),
  ]);

  return { routesText, tripsText, stopsText, stopTimesText, calendarText, calendarDatesText, fetchedAt: new Date() };
}

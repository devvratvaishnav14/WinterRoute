/**
 * A minimal RFC4180-style CSV parser for GTFS static text tables. GTFS
 * files are plain comma-separated with optional double-quoted fields
 * (quotes doubled to escape) — small enough not to warrant a dependency,
 * and needed either way for the streaming line-by-line scan
 * `stop_times.txt` requires (see `store.ts`'s doc comment on why that file
 * isn't eagerly parsed in full).
 */

/** Splits one CSV line into fields, honoring quoted fields (which may contain commas or escaped `""`). */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  fields.push(current);
  return fields;
}

function splitLines(text: string): string[] {
  // GTFS files may use \r\n or \n; a trailing newline shouldn't produce a
  // bogus empty final row.
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** Parses a full CSV table into an array of header-keyed row objects. Fine for GTFS's small tables; large tables should use `streamCsvRows` instead. */
export function parseCsvTable(text: string): Array<Record<string, string>> {
  const lines = splitLines(text);
  if (lines.length === 0) return [];

  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const rows: Array<Record<string, string>> = [];

  for (let i = 1; i < lines.length; i++) {
    if (lines[i].length === 0) continue;
    const values = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    rows.push(row);
  }

  return rows;
}

/**
 * Lazily yields header-keyed row objects one at a time, for a large table
 * (`stop_times.txt`, 1.84M rows in TransLink's real feed) where building
 * the full array in memory at once would be wasteful when the caller only
 * needs to filter for a handful of trip IDs.
 */
export function* streamCsvRows(text: string): Generator<Record<string, string>> {
  const lines = splitLines(text);
  if (lines.length === 0) return;

  const headers = parseCsvLine(lines[0]).map((h) => h.trim());

  for (let i = 1; i < lines.length; i++) {
    if (lines[i].length === 0) continue;
    const values = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    yield row;
  }
}

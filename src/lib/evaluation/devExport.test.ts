import { describe, expect, it } from "vitest";
import { exportSnapshotAsJson } from "./devExport";
import { buildTestSnapshot } from "./fixtures";

describe("exportSnapshotAsJson", () => {
  it("produces valid, parseable JSON", () => {
    const snapshot = buildTestSnapshot();
    expect(() => JSON.parse(exportSnapshotAsJson(snapshot))).not.toThrow();
  });

  it("redacts location labels by default", () => {
    const snapshot = buildTestSnapshot();
    const json = exportSnapshotAsJson(snapshot);
    expect(json).not.toContain("originLabel");
    expect(json).not.toContain("destinationLabel");
  });

  it("includes full labels only when redact is explicitly disabled", () => {
    const snapshot = buildTestSnapshot();
    const json = exportSnapshotAsJson(snapshot, { redact: false });
    expect(json).toContain("originLabel");
  });

  it("throws rather than exporting a snapshot with a suspicious field name", () => {
    const snapshot = buildTestSnapshot();
    const poisoned = { ...snapshot, apiKey: "should-never-exist" } as typeof snapshot;
    expect(() => exportSnapshotAsJson(poisoned, { redact: false })).toThrow();
  });

  it("respects the indent option", () => {
    const snapshot = buildTestSnapshot();
    const compact = exportSnapshotAsJson(snapshot, { indent: 0 });
    expect(compact).not.toContain("\n");
  });
});

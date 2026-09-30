// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { buildPreviewMarkerContent } from "./previewMarkerContent";

const MODES = ["walk", "cycle", "drive", "bus", "rail"] as const;

describe("buildPreviewMarkerContent", () => {
  it("tags the element with its own mode", () => {
    for (const mode of MODES) {
      expect(buildPreviewMarkerContent(mode).dataset.previewMode).toBe(mode);
    }
  });

  it("gives every mode a visually distinct marker (different background color)", () => {
    const colors = new Set(MODES.map((mode) => buildPreviewMarkerContent(mode).style.background));
    expect(colors.size).toBe(MODES.length);
  });

  it("renders original inline SVG content, never an empty marker", () => {
    for (const mode of MODES) {
      expect(buildPreviewMarkerContent(mode).innerHTML.length).toBeGreaterThan(0);
    }
  });
});

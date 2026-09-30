import { describe, expect, it } from "vitest";
import { route, segment } from "@/lib/scoring/fixtures";
import { WALK_CYCLE_PROVIDER_WARNING } from "./computeRoute";
import { presentRouteNote, presentRouteNotes } from "./routeNotePresentation";

const walkRoute = route([segment({ mode: "walk" })]);
const cycleRoute = route([segment({ mode: "cycle" })]);

describe("presentRouteNote", () => {
  it("simplifies the known walk/cycle beta warning for a walking route", () => {
    const note = presentRouteNote(WALK_CYCLE_PROVIDER_WARNING, walkRoute);
    expect(note.headline).toBe("Route note");
    expect(note.summary).toBe("Walking directions are in beta and may occasionally miss sidewalks or pedestrian paths.");
  });

  it("simplifies the known walk/cycle beta warning differently for a cycling route", () => {
    const note = presentRouteNote(WALK_CYCLE_PROVIDER_WARNING, cycleRoute);
    expect(note.summary).toBe("Cycling directions are in beta and may occasionally miss dedicated cycling paths.");
  });

  it("never fabricates a simplification for an unrecognized provider warning — shows it as-is", () => {
    const note = presentRouteNote("Some other Google-supplied disclaimer.", walkRoute);
    expect(note.summary).toBe("Some other Google-supplied disclaimer.");
  });

  it("always preserves the original verbatim text, regardless of simplification", () => {
    const note = presentRouteNote(WALK_CYCLE_PROVIDER_WARNING, walkRoute);
    expect(note.original).toBe(WALK_CYCLE_PROVIDER_WARNING);
  });

  it("never uses hazard/warning framing in the headline", () => {
    const note = presentRouteNote(WALK_CYCLE_PROVIDER_WARNING, walkRoute);
    expect(note.headline.toLowerCase()).not.toMatch(/warning|danger|hazard|severe/);
  });
});

describe("presentRouteNotes", () => {
  it("maps every warning independently", () => {
    const notes = presentRouteNotes([WALK_CYCLE_PROVIDER_WARNING, "another warning"], walkRoute);
    expect(notes).toHaveLength(2);
  });

  it("returns an empty array for no warnings", () => {
    expect(presentRouteNotes([], walkRoute)).toEqual([]);
  });
});

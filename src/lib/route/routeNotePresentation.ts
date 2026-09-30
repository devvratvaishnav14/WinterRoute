import { WALK_CYCLE_PROVIDER_WARNING } from "./computeRoute";
import type { Route } from "./types";

/**
 * Turns a raw provider warning (currently always Google's required
 * walk/cycle beta disclaimer, plus whatever else `googleResult.warnings`
 * might someday return) into a calm, neutral "route note" — never
 * looking like a weather/hazard warning. The ORIGINAL provider string is
 * always preserved verbatim (`original`) so the required wording is
 * never lost, just re-worded for the headline.
 */
export interface RouteNotePresentation {
  headline: string;
  summary: string;
  original: string;
}

/** The one warning WinterRoute recognizes exactly and knows how to simplify — matched by identity against the same constant `computeRoute.ts` pushes, never by guessing at arbitrary provider text. */
function simplifiedWalkCycleNote(route: Route): string {
  const isCycling = route.segments.some((s) => s.mode === "cycle");
  return isCycling
    ? "Cycling directions are in beta and may occasionally miss dedicated cycling paths."
    : "Walking directions are in beta and may occasionally miss sidewalks or pedestrian paths.";
}

/**
 * Any warning WinterRoute doesn't specifically recognize is shown
 * as-is (still under the neutral "Route note" heading, never
 * re-worded) — safer than guessing at a simplification for text we
 * don't control.
 */
export function presentRouteNote(rawWarning: string, route: Route): RouteNotePresentation {
  if (rawWarning === WALK_CYCLE_PROVIDER_WARNING) {
    return { headline: "Route note", summary: simplifiedWalkCycleNote(route), original: rawWarning };
  }
  return { headline: "Route note", summary: rawWarning, original: rawWarning };
}

export function presentRouteNotes(rawWarnings: string[], route: Route): RouteNotePresentation[] {
  return rawWarnings.map((warning) => presentRouteNote(warning, route));
}

/**
 * Presentation-only "Route Conditions" domain — turns already-computed
 * weather/traffic/transit/road-event data into a small, ordered list of
 * hazard/condition rows for the results UI. Nothing here is a new
 * analytical score: `RouteConditionSeverity` controls visual emphasis
 * only, is never read by `lib/scoring/`, and never substitutes for the
 * existing `ExperimentalCommuteRiskV0` disruption index. See
 * `docs/architecture.md` "Route Conditions architecture" and
 * `severity.ts`'s doc comments for exactly which factual evidence
 * drives each severity level.
 */

import type { WeatherIconKind } from "@/lib/weatherScene/icon";

/**
 * Visual emphasis only — never a probability, never a safety
 * certification. Ordered least to most attention-grabbing.
 * - `"neutral"`: ordinary/normal information (clear skies, on-time transit).
 * - `"notice"`: worth knowing, not alarming (light rain, minor construction).
 * - `"warning"`: meaningfully disruptive, evidenced (heavy rain, a
 *   skipped stop, a moderate road event).
 * - `"severe"`: the strongest tier — reserved for an official provider
 *   category that says so, or an unambiguous factual event (cancellation,
 *   closure, a major road event).
 */
export type RouteConditionSeverity = "neutral" | "notice" | "warning" | "severe";

export type RouteConditionCategory = "weather" | "transit" | "road" | "traffic";

/**
 * Visual weight, independent of severity — a genuinely light-but-real
 * rain shower is still `"primary"` (it directly answers "will it rain?"),
 * while an ordinary, uneventful temperature reading is `"supporting"`
 * even though both may be `severity: "neutral"`/`"notice"`. Keeps
 * "prominent conditions large, ordinary metrics compact" (see
 * `RouteConditions.tsx`) out of ad hoc JSX conditionals.
 */
export type RouteConditionEmphasis = "primary" | "supporting";

export interface RouteConditionItem {
  id: string;
  category: RouteConditionCategory;
  /** e.g. "Rainfall Warning", "145", "Construction" — the prominent label. */
  title: string;
  /** e.g. "Light rain possible along part of your route", "Schedule available · realtime not yet available". */
  summary: string;
  severity: RouteConditionSeverity;
  emphasis: RouteConditionEmphasis;
  /**
   * The badge text shown for a non-neutral item, when a more
   * user-meaningful word exists than the generic severity label (e.g.
   * "Possible"/"Likely"/"Expected" for uncertain weather, or the
   * official "Warning"/"Watch"/"Advisory" for an alert) — falls back to
   * `SEVERITY_LABEL[severity]` when absent. Internal severity values
   * (`neutral`/`notice`/`warning`/`severe`) are unchanged and still
   * drive color/emphasis; this only overrides the displayed WORD.
   */
  badgeLabel?: string;
  /** e.g. "Environment and Climate Change Canada" — shown unobtrusively, only when a real provider issued this item. */
  source?: string;
  /** e.g. a segment/stop label, when the evidence is tied to a specific part of the route. */
  affectedPortion?: string;
  /** Optional secondary line (e.g. "1 of 3 forecast models predicts rain") — kept short; deep technical detail stays in Details/dev diagnostics, never here. */
  detail?: string;
  /** Weather items only — derived from the SAME `WeatherSceneDescriptor` driving the page's background scene (see `lib/weatherScene/icon.ts`'s `deriveWeatherIconKind`), so the icon can never disagree with either the text or the atmosphere. */
  icon?: WeatherIconKind;
}

import type { RouteConditionSeverity } from "@/lib/conditions/types";

/**
 * The single place severity maps to Tailwind classes/labels — never
 * scatter `if severe then red` through JSX. Restrained: severity shows
 * up as a small accent/border/badge, never a solid full-card color.
 * Text labels are always present alongside color (see `SEVERITY_LABEL`)
 * so severity is never conveyed by color alone.
 *
 * These are the FALLBACK badge words, used only when a
 * `RouteConditionItem` doesn't supply its own more-meaningful
 * `badgeLabel` (e.g. weather's "Possible"/"Likely"/"Expected", or an
 * alert's own official "Warning"/"Watch"/"Advisory" classification —
 * see `buildRouteConditions.ts`). Internal severity NAMES
 * (`neutral`/`notice`/`warning`/`severe`) are unchanged; only the
 * DISPLAYED word for the generic `"notice"` case changed, from the
 * meaningless-to-users "Notice" to "Minor".
 */
export const SEVERITY_LABEL: Record<RouteConditionSeverity, string> = {
  neutral: "Normal",
  notice: "Minor",
  warning: "Warning",
  severe: "Severe",
};

export interface SeverityStyle {
  border: string;
  accentText: string;
  badge: string;
}

export const SEVERITY_STYLE: Record<RouteConditionSeverity, SeverityStyle> = {
  neutral: { border: "border-white/15", accentText: "text-white/85", badge: "border-white/20 bg-white/10 text-white/60" },
  notice: { border: "border-amber-300/25", accentText: "text-amber-100", badge: "border-amber-300/30 bg-amber-300/10 text-amber-200" },
  warning: { border: "border-orange-400/35", accentText: "text-orange-100", badge: "border-orange-400/40 bg-orange-400/10 text-orange-200" },
  severe: { border: "border-rose-500/45", accentText: "text-rose-100", badge: "border-rose-500/50 bg-rose-500/15 text-rose-200" },
};

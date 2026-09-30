import type { Route } from "@/lib/route/types";
import { buildRouteConditions } from "@/lib/conditions/buildRouteConditions";
import type { RouteConditionCategory, RouteConditionItem } from "@/lib/conditions/types";
import type { WeatherPreviewState } from "@/components/trip/WeatherPreview";
import type { TrafficPreviewState } from "@/components/trip/TrafficPreview";
import type { TransitPreviewState } from "@/components/trip/TransitPreview";
import { WeatherIcon } from "@/components/weatherScene/WeatherIcon";
import { SEVERITY_LABEL, SEVERITY_STYLE } from "./routeConditionVisuals";

const CATEGORY_LABEL: Record<RouteConditionCategory, string> = {
  weather: "Weather",
  transit: "Transit",
  road: "Road",
  traffic: "Traffic",
};

function sourceNotices(
  route: Route,
  weatherState: WeatherPreviewState | null,
  trafficState: TrafficPreviewState | null,
  transitState: TransitPreviewState | null,
): string[] {
  const notices: string[] = [];

  if (weatherState?.status === "loading") notices.push("Checking weather…");
  if (weatherState?.status === "error") notices.push("Weather data unavailable");

  const hasDrive = route.segments.some((s) => s.mode === "drive");
  if (hasDrive) {
    if (trafficState?.status === "loading") notices.push("Checking traffic…");
    if (trafficState?.status === "error") notices.push("Traffic data unavailable");
  }

  const hasTransit = route.segments.some((s) => s.mode === "bus" || s.mode === "rail");
  if (hasTransit) {
    if (transitState?.status === "loading") notices.push("Checking transit…");
    if (transitState?.status === "error") notices.push("Transit data unavailable");
  }

  return notices;
}

/** A prominent condition — the dominant weather answer, an official alert, or a genuine disruption. Large, bordered, its own card. */
function PrimaryConditionRow({ item }: { item: RouteConditionItem }) {
  const style = SEVERITY_STYLE[item.severity];

  return (
    <div className={`rounded-xl border ${style.border} bg-white/[0.08] px-3.5 py-3`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-medium tracking-[0.15em] text-white/50 uppercase">{CATEGORY_LABEL[item.category]}</p>
          <p className={`mt-0.5 flex items-center gap-1.5 text-base font-bold ${style.accentText}`}>
            {item.icon ? <WeatherIcon kind={item.icon} className={`h-5 w-5 shrink-0 ${style.accentText}`} /> : null}
            {item.title}
          </p>
          <p className="mt-0.5 text-sm text-white/80">{item.summary}</p>
          {item.detail ? <p className="mt-0.5 text-[11px] text-white/55">{item.detail}</p> : null}
          {item.affectedPortion ? <p className="mt-0.5 text-[11px] text-white/55">→ {item.affectedPortion}</p> : null}
          {item.source ? <p className="mt-1 text-[11px] text-white/50">{item.source}</p> : null}
        </div>
        {item.severity !== "neutral" ? (
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium whitespace-nowrap ${style.badge}`}>
            {item.badgeLabel ?? SEVERITY_LABEL[item.severity]}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** An ordinary supporting metric (temperature, ordinary wind, "snow not expected") — a single compact line, not its own full card, so trivial conditions don't compete visually with real ones. */
function SupportingConditionRow({ item }: { item: RouteConditionItem }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-xs">
      <span className="text-white/55">{item.title}</span>
      <span className="text-right text-white/85">
        {item.summary}
        {item.detail ? <span className="block text-[11px] text-white/50">{item.detail}</span> : null}
      </span>
    </div>
  );
}

/**
 * Route Conditions — a compact, severity-ordered hazard/condition list.
 * Official warnings and factual disruptions rise to the top; ordinary
 * temperature/wind readings sink to the bottom (see
 * `buildRouteConditions`). `RouteConditionItem.emphasis` splits items
 * into a small number of large, prominent cards (the dominant weather
 * answer, official alerts, genuine disruptions) and a single compact
 * block of ordinary supporting metrics — never five equal-size cards
 * for trivial information. Presentation-only: severity here is never a
 * probability, never a safety certification, and never substitutes for
 * the existing disruption index elsewhere on the page.
 */
export function RouteConditions({
  route,
  weatherState,
  trafficState,
  transitState,
}: {
  route: Route;
  weatherState: WeatherPreviewState | null;
  trafficState: TrafficPreviewState | null;
  transitState: TransitPreviewState | null;
}) {
  const items = buildRouteConditions(route, weatherState, trafficState, transitState);
  const notices = sourceNotices(route, weatherState, trafficState, transitState);

  if (items.length === 0 && notices.length === 0) return null;

  const primaryItems = items.filter((item) => item.emphasis === "primary");
  const supportingItems = items.filter((item) => item.emphasis === "supporting");

  return (
    <div>
      <p className="mb-2.5 text-xs font-medium tracking-[0.2em] text-white/50 uppercase">Route conditions</p>
      {notices.length > 0 ? <p className="mb-2 text-xs text-white/50">{notices.join(" · ")}</p> : null}

      {primaryItems.length > 0 ? (
        <div className="flex flex-col gap-2">
          {primaryItems.map((item) => (
            <PrimaryConditionRow key={item.id} item={item} />
          ))}
        </div>
      ) : null}

      {supportingItems.length > 0 ? (
        <div className={`rounded-xl border border-white/15 bg-white/[0.05] px-3.5 py-1 ${primaryItems.length > 0 ? "mt-2" : ""}`}>
          <div className="divide-y divide-white/10">
            {supportingItems.map((item) => (
              <SupportingConditionRow key={item.id} item={item} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

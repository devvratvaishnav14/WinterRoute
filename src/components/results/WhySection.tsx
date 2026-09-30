import type { Route } from "@/lib/route/types";
import { buildWeatherHeadlines } from "@/lib/conditions/weatherHeadline";
import type { DurationPreviewState } from "@/components/trip/DurationPreview";
import type { TimingPreviewState } from "@/components/trip/TimingPreview";
import type { WeatherPreviewState } from "@/components/trip/WeatherPreview";

const MAX_REASONS = 3;

const NEUTRAL_CLOSER = "No significant disruption is currently affecting this trip.";

/**
 * A three-way contextual "why" section — never claims a trip is
 * different when it isn't, and never lets an uncertainty caveat (e.g.
 * "no realtime update yet") masquerade as a reason the trip is
 * different:
 *
 * 1. A genuine DISRUPTION reason exists (`explanation` — traffic adding
 *    time, an active service alert, a road event, notable weather) ->
 *    "Why this commute is different", listing only those reasons.
 * 2. No disruption reason, but a real UNCERTAINTY/DATA-COVERAGE note
 *    exists (`notes` — no realtime update yet, no traffic data
 *    available — or a genuinely-expected-but-non-disruptive rain/snow
 *    condition, reusing the same sentence Route Conditions shows) ->
 *    "What to know", listing only those notes.
 * 3. Neither -> "At a glance": the timing model's own factual
 *    restatement (`summarySentences`) plus a plain "nothing unusual"
 *    closer — never inventing reasons to populate the section.
 *
 * "reasons" only ever come from `timing`/`duration`'s own explanation
 * arrays — deliberately NOT `risk.explanation`. `lib/scoring/
 * explanation.ts` builds a full per-factor narrative (including
 * "nothing happened" sentences like "No relevant road events were
 * found near the route.") for a different purpose entirely; reading it
 * here used to leak that technical language into a low-disruption
 * trip's "why" section. `timingState` is always populated alongside
 * `riskState` in the real app flow, so that fallback never legitimately
 * fired — this section simply never reads risk data.
 *
 * Only shown for a real recommendation/arrival
 * (`"available"`/`"limited-data"`) — `route-disrupted`/
 * `insufficient-data`/`departure-window-missed` already get their own
 * message from `TimingHero`, and a neutral "nothing unusual" line here
 * would contradict it.
 */
export function WhySection({
  timingState,
  durationState,
  weatherState,
  route,
}: {
  timingState: TimingPreviewState | null;
  durationState: DurationPreviewState | null;
  weatherState: WeatherPreviewState | null;
  route: Route | null;
}) {
  const reasonsSource =
    (timingState?.timing.explanation.length ? timingState.timing.explanation : undefined) ??
    (durationState?.duration.explanation.length ? durationState.duration.explanation : undefined) ??
    [];

  const reasons = reasonsSource.slice(0, MAX_REASONS);

  if (reasons.length > 0) {
    return <Section heading="Why this commute is different" items={reasons} />;
  }

  const notesSource =
    (timingState?.timing.notes.length ? timingState.timing.notes : undefined) ?? durationState?.duration.notes ?? [];
  const notes = [...notesSource];

  // Nothing rose to the level of a "reason" — but a real, user-relevant
  // rain/snow condition (however uncertain) is still worth a line here,
  // rather than being silently dropped.
  if (route && weatherState?.status === "success") {
    const headlines = buildWeatherHeadlines(weatherState.analysis, route);
    if (headlines && headlines.rain.intensity !== "none") {
      notes.push(headlines.rain.sentence);
    } else if (headlines && headlines.snow.intensity !== "none") {
      notes.push(headlines.snow.sentence);
    }
  }

  const trimmedNotes = notes.slice(0, MAX_REASONS);

  if (trimmedNotes.length > 0) {
    return <Section heading="What to know" items={trimmedNotes} />;
  }

  const timingStatus = timingState?.timing.status;
  const canShowNeutralSummary = timingStatus === "available" || timingStatus === "limited-data";
  const summarySentences = timingState?.timing.summarySentences ?? [];

  if (canShowNeutralSummary && summarySentences.length > 0) {
    return <Section heading="At a glance" items={[...summarySentences, NEUTRAL_CLOSER]} />;
  }

  return null;
}

function Section({ heading, items }: { heading: string; items: string[] }) {
  return (
    <div>
      <p className="text-xs font-medium tracking-[0.2em] text-white/55 uppercase">{heading}</p>
      <ul className="mt-2 space-y-1.5 text-sm text-white/80">
        {items.map((item, index) => (
          <li key={index} className="flex gap-2">
            <span aria-hidden className="text-white/45">
              •
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

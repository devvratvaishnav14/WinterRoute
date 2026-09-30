"use client";

import { useState } from "react";
import type { Route } from "@/lib/route/types";
import { presentRouteNotes } from "@/lib/route/routeNotePresentation";

/**
 * A calm, neutral presentation for provider (Google) route disclaimers —
 * e.g. the required walk/cycle beta warning. Deliberately styled as
 * quiet info, never amber/red hazard styling, so it's never mistaken
 * for a weather/road/transit condition. The full original provider
 * wording stays available (never silently dropped) behind a small
 * "Show details" toggle.
 */
export function RouteNote({ route, providerWarnings }: { route: Route; providerWarnings: string[] }) {
  const [expanded, setExpanded] = useState(false);
  if (providerWarnings.length === 0) return null;

  const notes = presentRouteNotes(providerWarnings, route);

  return (
    <div className="flex items-start gap-2 rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-xs text-white/65">
      <span aria-hidden className="mt-0.5 text-white/45">
        ⓘ
      </span>
      <div className="min-w-0">
        {notes.map((note, index) => (
          <p key={index} className={index > 0 ? "mt-1" : undefined}>
            <span className="font-medium text-white/75">{note.headline}: </span>
            {note.summary}
          </p>
        ))}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-1 text-white/50 underline decoration-white/20 underline-offset-2 hover:text-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
        >
          {expanded ? "Hide details" : "Show details"}
        </button>
        {expanded ? (
          <div className="mt-1.5 space-y-1 border-t border-white/15 pt-1.5 text-white/55">
            {notes.map((note, index) => (
              <p key={index}>{note.original}</p>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

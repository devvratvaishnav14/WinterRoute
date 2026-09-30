"use client";

import type { PreviewStatus } from "@/lib/preview/types";

/** A small circular badge around the play triangle — a clearer, more legible "this is playable" glyph than a bare icon floating in the button text. */
function PlayGlyph() {
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-300/25 text-sky-100 transition-colors group-hover:bg-sky-300/40">
      <svg viewBox="0 0 24 24" className="h-3 w-3 translate-x-px" aria-hidden>
        <path d="M8 5.5v13l11-6.5-11-6.5z" fill="currentColor" />
      </svg>
    </span>
  );
}

const BUTTON_BASE =
  "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium backdrop-blur-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400";
/** No card wraps this row — it sits directly over the scene — so every button (even the plain Pause/Stop ones) needs its own subtle fill, not just a border, to stay readable over a bright/pale scene. */
const BUTTON_PLAIN = "border-white/20 bg-white/[0.08] text-white/85 hover:border-white/35 hover:bg-white/[0.12] hover:text-white";
/**
 * The PRIMARY call-to-action (Preview my commute / Replay) — deliberately
 * more noticeable than the plain Pause/Stop/Resume buttons (which stay
 * quiet so they don't compete with timing/route conditions), but still a
 * small pill, never a hero button: a persistent soft sky-tinted glow
 * (not just a plain border), stronger on hover, plus a tiny hover-only
 * lift for a bit of "this is interactive" motion cue —
 * `motion-reduce:` disables that lift specifically, without touching the
 * (non-motion) color/glow hover state.
 */
const BUTTON_PRIMARY =
  "group border-sky-300/35 bg-white/[0.1] text-white/95 font-semibold shadow-[0_0_0_1px_rgba(125,190,255,0.1),0_3px_16px_-4px_rgba(94,169,255,0.45)] hover:border-sky-300/60 hover:bg-white/[0.15] hover:text-white hover:shadow-[0_0_0_1px_rgba(125,190,255,0.22),0_6px_22px_-4px_rgba(94,169,255,0.65)] hover:-translate-y-0.5 motion-reduce:hover:translate-y-0";

/**
 * The "Preview my commute" control row — a small, discoverable pill (not
 * a hero CTA), plus Pause/Resume/Stop/Replay once playing. Progress is
 * shown only as a short truthful status line ("Previewing commute…"),
 * never a fabricated percentage. `aria-live="polite"` carries the
 * hook's own infrequent announcements (start, each new segment,
 * completion) — visually hidden, since the visual state (button labels)
 * already communicates status to sighted users.
 */
export function CommutePreviewControls({
  status,
  announcement,
  canPlay,
  onStart,
  onPause,
  onResume,
  onStop,
  onReplay,
}: {
  status: PreviewStatus;
  announcement: string;
  canPlay: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onReplay: () => void;
}) {
  if (!canPlay) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {status === "idle" ? (
        <button type="button" onClick={onStart} className={`${BUTTON_BASE} ${BUTTON_PRIMARY} px-4 py-2`}>
          <PlayGlyph />
          Preview my commute
        </button>
      ) : null}

      {status === "playing" ? (
        <>
          <span className="text-xs text-white/65">Previewing commute…</span>
          <button type="button" onClick={onPause} className={`${BUTTON_BASE} ${BUTTON_PLAIN}`}>
            Pause
          </button>
          <button type="button" onClick={onStop} className={`${BUTTON_BASE} ${BUTTON_PLAIN}`}>
            Stop
          </button>
        </>
      ) : null}

      {status === "paused" ? (
        <>
          <span className="text-xs text-white/65">Preview paused</span>
          <button type="button" onClick={onResume} className={`${BUTTON_BASE} ${BUTTON_PLAIN}`}>
            Resume
          </button>
          <button type="button" onClick={onStop} className={`${BUTTON_BASE} ${BUTTON_PLAIN}`}>
            Stop
          </button>
        </>
      ) : null}

      {status === "complete" ? (
        <button type="button" onClick={onReplay} className={`${BUTTON_BASE} ${BUTTON_PRIMARY} px-4 py-2`}>
          <PlayGlyph />
          Replay
        </button>
      ) : null}
    </div>
  );
}

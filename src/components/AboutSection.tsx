/**
 * A minimal, understated footer — deliberately not a card, not a
 * profile block: a thin top divider, a short project description, and
 * a two-line creator credit (name, then a smaller/muted study line).
 * Rendered near the bottom of every screen (form, loading, results),
 * outside any per-view content logic.
 */
export function AboutSection() {
  return (
    <div className="mx-auto mt-12 w-full max-w-xl border-t border-white/10 pt-6 text-center">
      <p className="text-xs font-medium tracking-[0.2em] text-white/45 uppercase">About this project</p>
      <p className="mt-3 text-sm leading-relaxed text-white/60">
        WinterRoute helps people understand how weather, traffic, transit, and route conditions may affect a trip before they leave. It is designed to give a clearer picture of what to expect along a chosen route, including possible delays, conditions along the way, and a quick preview of the commute.
      </p>
      <div className="mt-5">
        <p className="text-sm font-medium text-white/80">Devvrat Vaishnav</p>
        <p className="text-xs text-white/50">BSc in Data Science</p>
      </div>
    </div>
  );
}

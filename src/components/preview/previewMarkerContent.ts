import type { SegmentTransportMode } from "@/lib/route/types";

/**
 * Small, original, single-mode glyphs for the moving preview marker —
 * deliberately simple geometric shapes (never copied TransLink/Uber
 * vehicle artwork), each with its own distinct silhouette AND color so
 * the mode reads even without color vision. Reuses the same per-mode
 * accent colors already established for route-line styling
 * (`routeMapGeometry.ts`'s `MODE_ROUTE_APPEARANCE`), so the marker never
 * disagrees with the line it's moving along. A soft white outline/halo
 * keeps the marker visible over any weather-scene backdrop or dense
 * rain/snow particle layer.
 */
const MODE_COLOR: Record<SegmentTransportMode, string> = {
  walk: "#26313f",
  cycle: "#0f9d78",
  drive: "#16233a",
  bus: "#2f6fed",
  rail: "#7c3aed",
};

function glyphSvg(mode: SegmentTransportMode): string {
  switch (mode) {
    case "walk":
      return `<circle cx="12" cy="6" r="2.4" fill="#fff"/><path d="M12 9v5l-3 5M12 14l3 5M9 11l-2 4M15 11l2 4" stroke="#fff" stroke-width="1.8" stroke-linecap="round" fill="none"/>`;
    case "cycle":
      return `<circle cx="7" cy="16" r="3" stroke="#fff" stroke-width="1.6" fill="none"/><circle cx="17" cy="16" r="3" stroke="#fff" stroke-width="1.6" fill="none"/><path d="M7 16l4-8h4l3 8M11 8h3M10 16h7" stroke="#fff" stroke-width="1.6" stroke-linecap="round" fill="none"/>`;
    case "drive":
      return `<rect x="4" y="9" width="16" height="7" rx="2.5" fill="#fff"/><circle cx="8" cy="17" r="1.6" fill="${MODE_COLOR.drive}"/><circle cx="16" cy="17" r="1.6" fill="${MODE_COLOR.drive}"/>`;
    case "bus":
      return `<rect x="3" y="7" width="18" height="10" rx="2.5" fill="#fff"/><rect x="5.5" y="9.3" width="13" height="3" rx="1" fill="${MODE_COLOR.bus}"/><circle cx="7.5" cy="18" r="1.5" fill="${MODE_COLOR.bus}"/><circle cx="16.5" cy="18" r="1.5" fill="${MODE_COLOR.bus}"/>`;
    case "rail":
      return `<rect x="5" y="5" width="14" height="13" rx="3" fill="#fff"/><line x1="12" y1="5" x2="12" y2="14" stroke="${MODE_COLOR.rail}" stroke-width="1.6"/><circle cx="8.5" cy="16.5" r="1.3" fill="${MODE_COLOR.rail}"/><circle cx="15.5" cy="16.5" r="1.3" fill="${MODE_COLOR.rail}"/>`;
  }
}

export function buildPreviewMarkerContent(mode: SegmentTransportMode): HTMLDivElement {
  const el = document.createElement("div");
  el.dataset.previewMode = mode;
  el.style.cssText = [
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "width:30px",
    "height:30px",
    "border-radius:9999px",
    `background:${MODE_COLOR[mode]}`,
    "border:2.5px solid rgba(255,255,255,0.92)",
    "box-shadow:0 2px 8px rgba(0,0,0,0.45)",
  ].join(";");
  el.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">${glyphSvg(mode)}</svg>`;
  return el;
}

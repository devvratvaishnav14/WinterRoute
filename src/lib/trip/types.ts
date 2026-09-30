import type { ResolvedLocation } from "@/lib/route/types";

export type TransportMode = "walk" | "car" | "bus" | "train" | "cycle";

export type TimePreference = "arriveBy" | "leaveAt";

/**
 * A user's trip request as captured by the input form.
 *
 * `origin`/`destination` are `ResolvedLocation`s (real coordinates, from a
 * verified Google Places selection) — not raw typed text. WinterRoute
 * distinguishes "what the user is currently typing" (plain component-local
 * string state — unverified, could be nonsense, never routed on) from "what
 * they've actually selected" (a `ResolvedLocation`, safe to route on). A
 * `TripRequest` only exists once both locations have been resolved; editing
 * the text after a selection invalidates it back to unresolved (see
 * `components/trip/LocationAutocomplete.tsx`), so this type can't represent
 * a half-typed field — that's exactly the point. See docs/architecture.md.
 *
 * `mode` is the user's single selected transportation preference for the
 * whole trip — it is not a route plan. The actual computed route (see
 * `lib/route/types.ts`) may have multiple segments with different modes
 * (e.g. walk -> bus -> rail -> walk) and should not be inferred from this
 * field.
 */
export interface TripRequest {
  origin: ResolvedLocation;
  destination: ResolvedLocation;
  timePreference: TimePreference;
  /** Combined local date + time the user selected, per the time preference. */
  dateTime: Date;
  mode: TransportMode;
}

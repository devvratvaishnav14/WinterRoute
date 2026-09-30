"use client";

import type { RecentTrip } from "@/lib/storage/recentTrips";
import { TRANSPORT_MODE_LABELS } from "@/lib/trip/format";

interface RecentTripsProps {
  trips: RecentTrip[];
  onSelect: (trip: RecentTrip) => void;
}

/**
 * Only rendered when there's real history — a first-time user sees exactly
 * the same clean form as before. Selecting a row prefills origin,
 * destination, and mode/time-preference but never submits: date/time is
 * intentionally left for the user to confirm (see
 * docs/decisions — reusing an old date silently would be wrong).
 */
export function RecentTrips({ trips, onSelect }: RecentTripsProps) {
  if (trips.length === 0) return null;

  return (
    <div className="mt-6">
      <p className="mb-2 text-[11px] font-medium tracking-wide text-white/40 uppercase">Recent trips</p>
      <ul className="flex flex-col gap-2">
        {trips.map((trip) => {
          const key = `${trip.origin.providerPlaceId ?? trip.origin.label}-${trip.destination.providerPlaceId ?? trip.destination.label}-${trip.mode}`;
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => onSelect(trip)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-left text-sm transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
              >
                <div className="truncate font-medium text-white">
                  {trip.origin.label} → {trip.destination.label}
                </div>
                <div className="mt-0.5 text-xs text-white/40">{TRANSPORT_MODE_LABELS[trip.mode]}</div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

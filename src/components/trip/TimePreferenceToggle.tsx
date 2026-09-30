"use client";

import type { TimePreference } from "@/lib/trip/types";

interface TimePreferenceToggleProps {
  value: TimePreference;
  onChange: (preference: TimePreference) => void;
}

const OPTIONS: { value: TimePreference; label: string }[] = [
  { value: "arriveBy", label: "Arrive by" },
  { value: "leaveAt", label: "Leave at" },
];

export function TimePreferenceToggle({ value, onChange }: TimePreferenceToggleProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Time preference"
      className="inline-flex w-fit rounded-full border border-white/10 bg-white/5 p-1"
    >
      {OPTIONS.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 ${
              selected ? "bg-white text-slate-900" : "text-white/60 hover:text-white"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

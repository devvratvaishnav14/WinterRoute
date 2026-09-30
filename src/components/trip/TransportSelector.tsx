"use client";

import { useRef, type KeyboardEvent, type ReactElement } from "react";
import type { TransportMode } from "@/lib/trip/types";
import { BusIcon, CarIcon, CycleIcon, TrainIcon, WalkIcon } from "./icons";

interface TransportOption {
  mode: TransportMode;
  label: string;
  Icon: (props: { className?: string }) => ReactElement;
}

const OPTIONS: TransportOption[] = [
  { mode: "walk", label: "Walk", Icon: WalkIcon },
  { mode: "car", label: "Car", Icon: CarIcon },
  { mode: "bus", label: "Bus", Icon: BusIcon },
  { mode: "train", label: "Train", Icon: TrainIcon },
  { mode: "cycle", label: "Cycle", Icon: CycleIcon },
];

interface TransportSelectorProps {
  value: TransportMode;
  onChange: (mode: TransportMode) => void;
}

export function TransportSelector({ value, onChange }: TransportSelectorProps) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function selectIndex(index: number) {
    onChange(OPTIONS[index].mode);
    buttonRefs.current[index]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        selectIndex((index + 1) % OPTIONS.length);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        selectIndex((index - 1 + OPTIONS.length) % OPTIONS.length);
        break;
      case "Home":
        event.preventDefault();
        selectIndex(0);
        break;
      case "End":
        event.preventDefault();
        selectIndex(OPTIONS.length - 1);
        break;
      default:
        break;
    }
  }

  return (
    <div role="radiogroup" aria-label="Transportation mode" className="grid grid-cols-5 gap-2">
      {OPTIONS.map(({ mode, label, Icon }, index) => {
        const selected = value === mode;
        return (
          <button
            key={mode}
            ref={(el) => {
              buttonRefs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => selectIndex(index)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 ${
              selected
                ? "border-sky-400/60 bg-sky-400/15 text-white"
                : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
            }`}
          >
            <Icon className="h-5 w-5" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

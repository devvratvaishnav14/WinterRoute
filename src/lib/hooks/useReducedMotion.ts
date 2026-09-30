"use client";

import { useEffect, useState } from "react";

/**
 * `prefers-reduced-motion: reduce` — read once via a lazy `useState`
 * initializer (never a same-tick `setState` inside `useEffect`, which
 * `eslint-plugin-react-hooks`'s `set-state-in-effect` rule flags as a
 * cascading-render risk) and kept live via a `change` listener. Shared
 * by every place that needs to respect this preference (weather-scene
 * animation, the loading sequence, "Preview my commute") rather than
 * each reimplementing the same `matchMedia` plumbing.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const listener = () => setReduced(query.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);

  return reduced;
}

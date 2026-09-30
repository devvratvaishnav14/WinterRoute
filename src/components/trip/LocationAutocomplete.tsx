"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { ResolvedLocation } from "@/lib/route/types";
import { fetchAutocompleteSuggestions, resolvePlace, type AutocompleteSuggestion } from "@/lib/client/placesClient";
import { ApiClientError } from "@/lib/client/apiError";
import { AUTOCOMPLETE_DEBOUNCE_MS, AUTOCOMPLETE_MIN_INPUT_LENGTH } from "@/lib/places/constants";
import { UNSUPPORTED_SERVICE_AREA_MESSAGE, isSupportedMunicipality } from "@/lib/geo/serviceArea";
import { addRecentLocation, getRecentLocations, type RecentLocation } from "@/lib/storage/recentLocations";

interface LocationAutocompleteProps {
  id: string;
  label: string;
  placeholder: string;
  markerVariant: "origin" | "destination";
  value: ResolvedLocation | null;
  onChange: (location: ResolvedLocation | null) => void;
  error?: string;
}

type ListEntry =
  | { kind: "recent"; key: string; recent: RecentLocation }
  | { kind: "suggestion"; key: string; suggestion: AutocompleteSuggestion };

type SuggestionStatus = "idle" | "loading" | "no-results" | "error";

function createSessionToken(): string {
  return crypto.randomUUID();
}

export function LocationAutocomplete({
  id,
  label,
  placeholder,
  markerVariant,
  value,
  onChange,
  error,
}: LocationAutocompleteProps) {
  const listboxId = `${id}-listbox`;
  const reactId = useId();

  const [text, setText] = useState(value?.label ?? "");
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<"recents" | "suggestions">("recents");
  const [recents, setRecents] = useState<RecentLocation[]>([]);
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [status, setStatus] = useState<SuggestionStatus>("idle");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);

  // Syncs displayed text when the parent sets/clears a resolved value from
  // outside this component (e.g. prefilling from a recent trip) — adjusted
  // during render (React's documented pattern for "reset state when a prop
  // changes") rather than in an Effect, which would cause an extra
  // cascading render for what's otherwise a same-render update.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (value) setText(value.label);
  }

  const rootRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sessionTokenRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  // Click-outside closes the dropdown.
  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen]);

  function ensureSessionToken(): string {
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = createSessionToken();
    }
    return sessionTokenRef.current;
  }

  function retireSessionToken() {
    sessionTokenRef.current = null;
  }

  function runSuggestionFetch(query: string) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("loading");

    fetchAutocompleteSuggestions(query, ensureSessionToken(), controller.signal)
      .then((results) => {
        if (controller.signal.aborted) return;
        setSuggestions(results);
        setStatus(results.length === 0 ? "no-results" : "idle");
        setActiveIndex(-1);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setSuggestions([]);
        setStatus("error");
        if (!(err instanceof ApiClientError)) {
          console.error("WinterRoute: autocomplete request failed", err);
        }
      });
  }

  function handleTextChange(nextText: string) {
    const previousText = text;
    setText(nextText);
    setLocalError(null);

    if (value) {
      // Selection is invalidated the moment the resolved text is edited —
      // a field containing text is not the same as a verified location.
      onChange(null);
    }

    if (previousText.trim().length === 0 && nextText.trim().length > 0) {
      // Starting a new "episode" — a session token covers everything from
      // here through the eventual selection, not per keystroke.
      retireSessionToken();
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    abortRef.current?.abort();

    const trimmed = nextText.trim();
    if (trimmed.length === 0) {
      setMode("recents");
      setSuggestions([]);
      setStatus("idle");
      setRecents(getRecentLocations());
      setIsOpen(true);
      return;
    }

    setMode("suggestions");
    if (trimmed.length < AUTOCOMPLETE_MIN_INPUT_LENGTH) {
      setSuggestions([]);
      setStatus("idle");
      setIsOpen(false);
      return;
    }

    setIsOpen(true);
    debounceRef.current = setTimeout(() => runSuggestionFetch(trimmed), AUTOCOMPLETE_DEBOUNCE_MS);
  }

  function handleFocus() {
    if (text.trim().length === 0) {
      setMode("recents");
      setRecents(getRecentLocations());
      setIsOpen(true);
    } else if (suggestions.length > 0 || status !== "idle") {
      setMode("suggestions");
      setIsOpen(true);
    }
  }

  async function selectSuggestion(suggestion: AutocompleteSuggestion) {
    const sessionToken = ensureSessionToken();
    setIsResolving(true);
    setIsOpen(false);

    try {
      const result = await resolvePlace(suggestion.placeId, sessionToken);
      if (!isSupportedMunicipality(result.municipality)) {
        setText(suggestion.mainText);
        setLocalError(UNSUPPORTED_SERVICE_AREA_MESSAGE);
        onChange(null);
        return;
      }

      setText(result.location.label);
      setLocalError(null);
      onChange(result.location);
      addRecentLocation(result.location, result.municipality);
    } catch (err) {
      setLocalError(
        err instanceof ApiClientError
          ? err.message
          : "Couldn't verify that location. Please try again.",
      );
      onChange(null);
    } finally {
      setIsResolving(false);
      retireSessionToken();
    }
  }

  function selectRecent(recent: RecentLocation) {
    setIsOpen(false);
    setText(recent.location.label);
    setLocalError(null);
    onChange(recent.location);
    addRecentLocation(recent.location, recent.municipality);
  }

  function handleBlur() {
    // A short delay would be a race; mousedown on options calls
    // preventDefault so this blur never fires from a genuine selection
    // click (see the listbox item's onMouseDown below).
    setIsOpen(false);
    retireSessionToken();
  }

  const entries: ListEntry[] =
    mode === "recents"
      ? recents.map((recent) => ({
          kind: "recent" as const,
          key: recent.location.providerPlaceId ?? recent.location.label,
          recent,
        }))
      : suggestions.map((suggestion) => ({
          kind: "suggestion" as const,
          key: suggestion.placeId,
          suggestion,
        }));

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!isOpen) {
        handleFocus();
        return;
      }
      setActiveIndex((current) => Math.min(current + 1, entries.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, -1));
    } else if (event.key === "Enter") {
      if (isOpen) {
        event.preventDefault();
        const active = entries[activeIndex];
        if (active) {
          if (active.kind === "recent") void selectRecent(active.recent);
          else void selectSuggestion(active.suggestion);
        }
      }
    } else if (event.key === "Escape") {
      if (isOpen) {
        event.preventDefault();
        setIsOpen(false);
      }
    }
  }

  const activeOptionId =
    activeIndex >= 0 && entries[activeIndex] ? `${reactId}-option-${activeIndex}` : undefined;
  const combinedError = localError ?? error;

  return (
    <div ref={rootRef} className="relative flex items-center gap-3 py-3">
      <span
        aria-hidden="true"
        className={
          markerVariant === "origin"
            ? "h-2.5 w-2.5 shrink-0 rounded-full bg-sky-400"
            : "h-2.5 w-2.5 shrink-0 rounded-[3px] bg-white"
        }
      />
      <div className="min-w-0 flex-1">
        <label
          htmlFor={id}
          className="block text-[11px] font-medium tracking-wide text-white/40 uppercase"
        >
          {label}
        </label>
        <input
          id={id}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-activedescendant={activeOptionId}
          aria-invalid={Boolean(combinedError)}
          aria-describedby={combinedError ? `${id}-error` : undefined}
          autoComplete="off"
          value={text}
          onChange={(event) => handleTextChange(event.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full bg-transparent py-0.5 text-base text-white placeholder:text-white/30 focus:outline-none"
        />
        {combinedError ? (
          <p id={`${id}-error`} className="mt-0.5 text-xs text-rose-300">
            {combinedError}
          </p>
        ) : null}
      </div>

      {isResolving ? (
        <span aria-hidden="true" className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
      ) : null}

      {isOpen ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={label}
          className="absolute top-full left-0 z-20 mt-2 max-h-64 w-full overflow-auto rounded-xl border border-white/10 bg-[#101a2e] py-1 shadow-xl shadow-black/40"
        >
          {mode === "recents" && entries.length === 0 ? (
            <li className="px-4 py-3 text-xs text-white/40">No recent locations yet.</li>
          ) : null}

          {mode === "recents" && entries.length > 0 ? (
            <li aria-hidden="true" className="px-4 pt-1 pb-1.5 text-[11px] font-medium tracking-wide text-white/40 uppercase">
              Recent
            </li>
          ) : null}

          {mode === "suggestions" && status === "loading" ? (
            <li className="px-4 py-3 text-xs text-white/40">Searching…</li>
          ) : null}

          {mode === "suggestions" && status === "no-results" ? (
            <li className="px-4 py-3 text-xs text-white/40">No matching places found.</li>
          ) : null}

          {mode === "suggestions" && status === "error" ? (
            <li className="px-4 py-3 text-xs text-rose-300">
              Couldn&apos;t load suggestions. Please try again.
            </li>
          ) : null}

          {entries.map((entry, index) => {
            const isActive = index === activeIndex;
            const mainText = entry.kind === "recent" ? entry.recent.location.label : entry.suggestion.mainText;
            const secondaryText =
              entry.kind === "recent"
                ? (entry.recent.municipality ?? "")
                : entry.suggestion.secondaryText;

            return (
              <li
                key={entry.key}
                id={`${reactId}-option-${index}`}
                role="option"
                aria-selected={isActive}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => {
                  if (entry.kind === "recent") void selectRecent(entry.recent);
                  else void selectSuggestion(entry.suggestion);
                }}
                className={`cursor-pointer px-4 py-2.5 text-sm ${
                  isActive ? "bg-white/10 text-white" : "text-white/80"
                }`}
              >
                <div className="truncate font-medium">{mainText}</div>
                {secondaryText ? (
                  <div className="truncate text-xs text-white/40">{secondaryText}</div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

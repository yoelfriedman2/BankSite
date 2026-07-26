"use client";

import { useEffect, useRef, useState } from "react";

type Suggestion = { display_name: string; lat?: string; lon?: string };

export type PickedPlace = { display: string; lat: number; lng: number };

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100";

let instanceCounter = 0;

/** Free-text address input with debounced autocomplete suggestions from
 *  OpenStreetMap's Nominatim search API (free, no key/billing — same service
 *  already trusted for the road-trip planner's geocoding). Never blocks
 *  manual typing if the lookup fails or is slow. */
export function AddressAutocomplete({
  id,
  value,
  onChange,
  onSelectCoords,
  placeholder,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /** Fired when a suggestion is picked, with its resolved coordinates. Lets a
   *  caller (e.g. the road-trip planner) geocode the address, not just capture
   *  the text. Optional — the Address Change page ignores it. */
  onSelectCoords?: (place: PickedPlace) => void;
  placeholder?: string;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useRef(`address-autocomplete-${++instanceCounter}`).current;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function pick(s: Suggestion) {
    onChange(s.display_name);
    const lat = Number(s.lat);
    const lng = Number(s.lon);
    if (onSelectCoords && Number.isFinite(lat) && Number.isFinite(lng)) {
      onSelectCoords({ display: s.display_name, lat, lng });
    }
    setOpen(false);
  }

  function handleInput(next: string) {
    onChange(next);
    setActiveIndex(-1);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const query = next.trim();
    if (query.length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const thisRequest = ++requestId.current;
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&addressdetails=0&limit=5&q=${encodeURIComponent(query)}`,
        );
        if (!res.ok) return;
        const data = (await res.json()) as Suggestion[];
        if (thisRequest !== requestId.current) return; // a newer keystroke superseded this
        setSuggestions(data);
        setOpen(data.length > 0);
      } catch {
        // Lookup failing should never block plain typing.
      }
    }, 400);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      if (activeIndex >= 0 && activeIndex < suggestions.length) {
        e.preventDefault();
        pick(suggestions[activeIndex]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const resultsSummary = open
    ? suggestions.length > 0
      ? `${suggestions.length} suggestion${suggestions.length === 1 ? "" : "s"}`
      : ""
    : "";

  return (
    <div ref={containerRef} className="relative">
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
        className={inputClass}
        placeholder={placeholder}
        value={value}
        onChange={(e) => handleInput(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />
      <span className="sr-only" role="status" aria-live="polite">{resultsSummary}</span>
      {open && (
        <ul id={listboxId} role="listbox" className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg">
          {suggestions.map((s, i) => (
            <li key={i} id={`${listboxId}-${i}`} role="option" aria-selected={i === activeIndex}>
              <button
                type="button"
                className={`block w-full truncate px-3 py-2 text-left text-slate-700 hover:bg-amber-50 ${i === activeIndex ? "bg-amber-50" : ""}`}
                onClick={() => pick(s)}
                onMouseEnter={() => setActiveIndex(i)}
              >
                {s.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

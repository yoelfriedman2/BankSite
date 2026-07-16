"use client";

import { useEffect, useRef, useState } from "react";

type Suggestion = { display_name: string; lat?: string; lon?: string };

export type PickedPlace = { display: string; lat: number; lng: number };

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100";

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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleInput(next: string) {
    onChange(next);
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

  return (
    <div ref={containerRef} className="relative">
      <input
        id={id}
        className={inputClass}
        placeholder={placeholder}
        value={value}
        onChange={(e) => handleInput(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        autoComplete="off"
      />
      {open && (
        <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg">
          {suggestions.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                className="block w-full truncate px-3 py-2 text-left text-slate-700 hover:bg-amber-50"
                onClick={() => {
                  onChange(s.display_name);
                  const lat = Number(s.lat);
                  const lng = Number(s.lon);
                  if (onSelectCoords && Number.isFinite(lat) && Number.isFinite(lng)) {
                    onSelectCoords({ display: s.display_name, lat, lng });
                  }
                  setOpen(false);
                }}
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

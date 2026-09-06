"use client";

import { useEffect, useRef, useState } from "react";

type NominatimAddress = {
  house_number?: string;
  road?: string;
  city?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  municipality?: string;
  suburb?: string;
  county?: string;
  state?: string;
  postcode?: string;
  country_code?: string;
  "ISO3166-2-lvl4"?: string;
};

type Suggestion = {
  display_name: string;
  lat?: string;
  lon?: string;
  address?: NominatimAddress;
};

export type PickedPlace = { display: string; lat: number; lng: number };

/** Nominatim's `display_name` is a full geocoder breadcrumb — street, neighborhood,
 *  city, COUNTY, state, zip, country ("123 Main St, Springfield, Hampden County,
 *  Massachusetts, 01101, United States") — technically accurate but not something
 *  you'd ever actually write on an envelope. Builds a normal mailing-address line
 *  ("123 Main St, Springfield, MA 01101") from Nominatim's structured `address`
 *  fields instead, falling back to the raw display_name only if there isn't enough
 *  structured data to build a real line from (e.g. a non-US or non-street result). */
function formatMailingAddress(s: Suggestion): string {
  const a = s.address;
  if (!a) return s.display_name;

  const street = [a.house_number, a.road].filter(Boolean).join(" ");
  const city = a.city || a.town || a.village || a.hamlet || a.municipality || a.suburb || "";

  const isoState = a["ISO3166-2-lvl4"];
  const stateAbbr =
    a.country_code === "us" && isoState?.startsWith("US-") ? isoState.slice(3) : a.state || "";

  const cityStateZip = [city, [stateAbbr, a.postcode].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");

  const line = [street, cityStateZip].filter(Boolean).join(", ");
  return line || s.display_name;
}

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100";

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
    const line = formatMailingAddress(s);
    onChange(line);
    const lat = Number(s.lat);
    const lng = Number(s.lon);
    if (onSelectCoords && Number.isFinite(lat) && Number.isFinite(lng)) {
      onSelectCoords({ display: line, lat, lng });
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
          `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&q=${encodeURIComponent(query)}`,
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
                className={`block w-full truncate px-3 py-2 text-left text-slate-700 hover:bg-teal-50 ${i === activeIndex ? "bg-teal-50" : ""}`}
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

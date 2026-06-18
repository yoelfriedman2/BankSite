"use client";

import { useEffect, useRef, useState } from "react";
import { Calendar } from "lucide-react";

/**
 * Date field you can BOTH type into freely and pick from a calendar.
 *
 * The stored value is always an ISO `YYYY-MM-DD` string (or "" when empty) —
 * the same shape the rest of the app expects. The visible text is the friendlier
 * `MM/DD/YYYY`, and typing accepts a few common formats (1/5/26, 01-05-2026,
 * 2026-01-05). The calendar button opens the native date picker.
 */

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** ISO (YYYY-MM-DD) -> display (MM/DD/YYYY). */
function toDisplay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : "";
}

/** Build an ISO date only if the calendar date is real (rejects 02/30 etc.). */
function normalize(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) {
    return null;
  }
  return `${y}-${pad(mo)}-${pad(d)}`;
}

/** Parse free-typed text -> ISO, "" (cleared), or null (unparseable). */
function parseToIso(input: string): string | null {
  const t = input.trim();
  if (!t) return "";
  // YYYY-MM-DD
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(t);
  if (m) return normalize(+m[1], +m[2], +m[3]);
  // M/D/YYYY or M/D/YY (slash, dash, or dot)
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(t);
  if (m) {
    let y = +m[3];
    if (y < 100) y += y >= 70 ? 1900 : 2000; // 70–99 → 19xx, 00–69 → 20xx
    return normalize(y, +m[1], +m[2]);
  }
  return null;
}

export function DateInput({
  id,
  value,
  onChange,
  className = "",
  placeholder = "MM/DD/YYYY",
}: {
  id?: string;
  value: string; // ISO YYYY-MM-DD or ""
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const [text, setText] = useState(() => toDisplay(value));
  const dateRef = useRef<HTMLInputElement>(null);

  // Re-sync the visible text whenever the stored value changes from outside
  // (form reset, calendar pick, programmatic update).
  useEffect(() => {
    setText(toDisplay(value));
  }, [value]);

  function commit(raw: string) {
    const iso = parseToIso(raw);
    if (iso === null) {
      // Unparseable — revert to the last good value so display and stored
      // value never disagree.
      setText(toDisplay(value));
      return;
    }
    onChange(iso);
    setText(toDisplay(iso));
  }

  function openPicker() {
    const el = dateRef.current;
    if (!el) return;
    if (typeof el.showPicker === "function") {
      try {
        el.showPicker();
        return;
      } catch {
        /* showPicker can throw if not allowed; fall through to focus */
      }
    }
    el.focus();
  }

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        className={`${className} pr-10`}
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit((e.target as HTMLInputElement).value);
        }}
      />
      {/* Hidden native date input — drives the calendar popup. */}
      <input
        ref={dateRef}
        type="date"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-3 h-0 w-0 opacity-0"
      />
      <button
        type="button"
        onClick={openPicker}
        title="Open calendar"
        aria-label="Open calendar"
        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
      >
        <Calendar className="h-4 w-4" />
      </button>
    </div>
  );
}

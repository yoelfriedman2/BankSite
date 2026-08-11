"use client";

import { forwardRef } from "react";
import { Search, X } from "lucide-react";

type SearchInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type"
> & {
  value: string;
  onChange: (value: string) => void;
  /** Extra classes for the outer wrapper (e.g. flex sizing, margins). */
  wrapperClassName?: string;
  /** Set false for a search box with no leading icon (rare — most have one). */
  showIcon?: boolean;
  focusRing?: "amber" | "blue";
};

/** A text input with a leading search icon and a trailing "clear" (X) button
 *  once there's something typed — so clearing a search doesn't mean holding
 *  backspace. Used by every search box in the app for a consistent feel. */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  function SearchInput(
    {
      value,
      onChange,
      wrapperClassName = "",
      showIcon = true,
      focusRing = "amber",
      className = "",
      disabled,
      ...rest
    },
    ref,
  ) {
    const ring =
      focusRing === "blue"
        ? "focus:border-blue-400 focus:outline-none"
        : "focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100";
    return (
      <div className={`relative ${wrapperClassName}`}>
        {showIcon && (
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        )}
        <input
          ref={ref}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={`w-full rounded-lg border border-slate-300 py-2 ${showIcon ? "pl-9" : "pl-3"} pr-8 text-sm text-slate-900 outline-none ${ring} ${className}`}
          {...rest}
        />
        {value && !disabled && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  },
);

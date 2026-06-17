export function Logo({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id="logoDepth" x1="0" y1="0" x2="0" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.05" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.2" />
        </linearGradient>
      </defs>

      {/* Background */}
      <rect width="48" height="48" rx="12" fill="#0f172a" />
      <rect width="48" height="48" rx="12" fill="url(#logoDepth)" />
      {/* Top-edge rim light */}
      <rect x="0" y="0" width="48" height="1.5" rx="0.75" fill="#ffffff" fillOpacity="0.08" />

      {/* F letterform — horizontal bars on left spine */}
      {/* Vertical spine */}
      <rect x="8" y="8" width="6" height="32" rx="3" fill="#ffffff" fillOpacity="0.82" />
      {/* Top bar (gold — longest) */}
      <rect x="8" y="8" width="30" height="7" rx="3.5" fill="#F59E0B" />
      {/* Middle crossbar (white — shorter) */}
      <rect x="8" y="20.5" width="20" height="7" rx="3.5" fill="#ffffff" fillOpacity="0.68" />

      {/* Gauge element — lower-right (where F has open space) */}
      {/* Gauge track (dim background arc) */}
      <path
        d="M 29.9 38.5 A 7 7 0 0 1 42.1 38.5"
        stroke="#ffffff"
        strokeOpacity="0.13"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />
      {/* Gauge active fill (gold — about 75% of arc) */}
      <path
        d="M 29.9 38.5 A 7 7 0 0 1 40.7 36.8"
        stroke="#F59E0B"
        strokeOpacity="0.9"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />
      {/* Gauge needle */}
      <line x1="36" y1="42" x2="38" y2="36.5" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
      {/* Gauge center pin */}
      <circle cx="36" cy="42" r="1.5" fill="#F59E0B" />
    </svg>
  );
}

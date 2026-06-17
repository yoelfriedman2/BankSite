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
          <stop offset="1" stopColor="#000000" stopOpacity="0.18" />
        </linearGradient>
      </defs>

      {/* Background */}
      <rect width="48" height="48" rx="12" fill="#0f172a" />
      <rect width="48" height="48" rx="12" fill="url(#logoDepth)" />
      {/* Top-edge rim light */}
      <rect x="0" y="0" width="48" height="1.5" rx="0.75" fill="#ffffff" fillOpacity="0.07" />

      {/* Baseline */}
      <rect x="9" y="37.5" width="30" height="1.25" rx="0.625" fill="#ffffff" fillOpacity="0.18" />

      {/* Left bar — shortest */}
      <rect x="11" y="26.5" width="7.5" height="11" rx="3.75" fill="#ffffff" fillOpacity="0.4" />

      {/* Middle bar */}
      <rect x="20.25" y="20" width="7.5" height="17.5" rx="3.75" fill="#ffffff" fillOpacity="0.65" />

      {/* Right bar — tallest */}
      <rect x="29.5" y="13.5" width="7.5" height="24" rx="3.75" fill="#ffffff" />

      {/* Gold cap on right bar */}
      <rect x="29.5" y="10" width="7.5" height="4.5" rx="2.25" fill="#F59E0B" />
    </svg>
  );
}

/**
 * App logo: a gradient badge with a geometric "F" whose stepped bars double as a
 * little bar chart (a quiet nod to "tracker"). Used in the nav, login, and icon.
 */
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
        <linearGradient
          id="logoGrad"
          x1="0"
          y1="0"
          x2="48"
          y2="48"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#6366F1" />
          <stop offset="1" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="13" fill="url(#logoGrad)" />
      {/* F stem */}
      <rect x="15" y="13" width="5.5" height="22" rx="2.75" fill="#fff" />
      {/* F top bar */}
      <rect x="15" y="13" width="19" height="5.5" rx="2.75" fill="#fff" />
      {/* F middle bar (shorter — bar-chart feel) */}
      <rect
        x="15"
        y="21.5"
        width="12.5"
        height="5.5"
        rx="2.75"
        fill="#fff"
        fillOpacity="0.92"
      />
      {/* rising accent bars */}
      <rect x="28.5" y="29" width="3.4" height="6" rx="1.7" fill="#fff" fillOpacity="0.65" />
      <rect x="33.4" y="25.5" width="3.4" height="9.5" rx="1.7" fill="#fff" fillOpacity="0.8" />
    </svg>
  );
}

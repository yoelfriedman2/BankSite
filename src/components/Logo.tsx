/**
 * App logo: a deep indigo→violet→fuchsia badge with a geometric "F" and a small
 * gold rising-bars accent (a quiet nod to finance + "tracking up").
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
          x1="2"
          y1="2"
          x2="46"
          y2="46"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#4338CA" />
          <stop offset="0.55" stopColor="#7C3AED" />
          <stop offset="1" stopColor="#C026D3" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="13" fill="url(#logoGrad)" />
      {/* subtle top gloss */}
      <rect width="48" height="22" rx="13" fill="#ffffff" fillOpacity="0.08" />
      {/* F */}
      <rect x="14" y="12" width="5.5" height="24" rx="2.75" fill="#fff" />
      <rect x="14" y="12" width="18" height="5.5" rx="2.75" fill="#fff" />
      <rect
        x="14"
        y="20.5"
        width="12"
        height="5.5"
        rx="2.75"
        fill="#fff"
        fillOpacity="0.95"
      />
      {/* gold rising-bars accent */}
      <rect x="28.6" y="29" width="3.4" height="6.5" rx="1.7" fill="#FCD34D" />
      <rect x="33.5" y="25" width="3.4" height="10.5" rx="1.7" fill="#FBBF24" />
    </svg>
  );
}

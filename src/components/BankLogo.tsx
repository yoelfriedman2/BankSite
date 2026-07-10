"use client";

import { useState } from "react";
import { bankFaviconUrl } from "@/lib/bankLogo";

/** Small favicon-based bank logo. Renders nothing (no placeholder, no
 *  broken-image icon) when the bank has no website on file or the favicon
 *  fails to load — this is decorative, never load-bearing. */
export function BankLogo({
  website,
  size = 18,
  className = "",
}: {
  website: string | null;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const src = bankFaviconUrl(website, size <= 16 ? 32 : 64);
  if (!src || failed) return null;
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={`shrink-0 rounded-sm ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

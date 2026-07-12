"use client";

import { isRunningAsTwa, openInExternalBrowser } from "@/lib/externalLink";

/** Drop-in replacement for `<a target="_blank" rel="noopener noreferrer">` used for
 *  every outbound link (bank websites, holding-company filings, etc). Behaves exactly
 *  like a normal new-tab link everywhere except inside the packaged Android app (TWA),
 *  where it hands off to the device's real browser instead of an in-app overlay — see
 *  lib/externalLink.ts. */
export function ExternalLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={(e) => {
        if (isRunningAsTwa()) {
          e.preventDefault();
          openInExternalBrowser(href);
        }
      }}
    >
      {children}
    </a>
  );
}

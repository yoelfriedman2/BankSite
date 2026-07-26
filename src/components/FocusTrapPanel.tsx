"use client";

import { useFocusTrap } from "@/lib/useFocusTrap";

/**
 * Thin wrapper around useFocusTrap for dialog-shaped content that's simpler
 * to drop in around existing children than to thread the hook's ref through
 * every call site by hand (UX-01) — used by panels with a lot of pre-existing
 * local state that would otherwise need extracting into a whole separate
 * component just to call a hook conditionally.
 */
export function FocusTrapPanel({
  onClose,
  labelledBy,
  className,
  children,
}: {
  onClose?: () => void;
  labelledBy?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const dialogRef = useFocusTrap<HTMLDivElement>(onClose);
  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={labelledBy} className={className}>
      {children}
    </div>
  );
}

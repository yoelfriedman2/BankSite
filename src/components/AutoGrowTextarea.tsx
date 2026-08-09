"use client";

import { useEffect, useRef, type TextareaHTMLAttributes } from "react";

/** A textarea that grows with its content instead of scrolling internally. */
export function AutoGrowTextarea({
  minRows = 2,
  className,
  value,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={minRows}
      value={value}
      className={`${className ?? ""} resize-none overflow-hidden`}
      {...rest}
    />
  );
}

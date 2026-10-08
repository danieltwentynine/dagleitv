"use client";

import { useEffect, useState } from "react";

/**
 * Plays whole ASCII frames. Under prefers-reduced-motion (or with one frame)
 * only the still frame shows. Server render and first paint use the still
 * frame, so there is no hydration mismatch.
 */
export function useAsciiFrames(frames: string[], ms = 380, still = 0): string {
  const [i, setI] = useState(still);
  useEffect(() => {
    if (frames.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setI((n) => (n + 1) % frames.length), ms);
    return () => clearInterval(id);
  }, [frames, ms]);
  return frames[i] ?? frames[still] ?? "";
}

type Size = "l" | "xl";

/** `text` is trusted static markup from ascii.ts (entities and highlight spans), never user input. */
export function Ascii({ text, size, className = "" }: { text: string; size?: Size; className?: string }) {
  return (
    <pre
      className={`ascii${size ? ` ascii-${size}` : ""} ${className}`}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: text }}
    />
  );
}

export function AnimatedAscii({
  frames,
  ms,
  still = 0,
  className = "",
  size,
}: {
  frames: string[];
  ms?: number;
  still?: number;
  className?: string;
  size?: Size;
}) {
  return <Ascii text={useAsciiFrames(frames, ms, still)} className={className} size={size} />;
}

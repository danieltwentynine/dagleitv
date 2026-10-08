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

export function Ascii({ text, size, className = "", ...rest }: { text: string; size?: "l" | "xl"; className?: string; "aria-hidden"?: boolean }) {
  return (
    <pre className={`ascii${size ? ` ascii-${size}` : ""} ${className}`} aria-hidden="true" {...rest}>
      {text}
    </pre>
  );
}

export function AnimatedAscii({ frames, ms, className = "", size }: { frames: string[]; ms?: number; className?: string; size?: "l" | "xl" }) {
  return <Ascii text={useAsciiFrames(frames, ms)} className={className} size={size} />;
}

"use client";

import { useEffect, useState } from "react";
import { useBrowserSupport, useMobilePortrait } from "./useBrowserSupport";

/** Full-screen nudge on phones held upright. Dismissable; returns when the phone is rotated back and forth. */
export function RotatePrompt() {
  const info = useBrowserSupport();
  const portrait = useMobilePortrait(info?.browser.mobile ?? false);
  const [dismissed, setDismissed] = useState(false);

  // Rotating to landscape resets the dismissal, so the nudge can return later.
  useEffect(() => {
    if (!portrait) setDismissed(false);
  }, [portrait]);

  if (!portrait || dismissed) return null;
  return (
    <div
      role="dialog"
      aria-label="Rotate your device"
      data-testid="rotate-prompt"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: "var(--z-toast)" as unknown as number,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "var(--space-4)",
        padding: "var(--space-6)",
        textAlign: "center",
        background: "var(--void)",
        color: "var(--text, inherit)",
      }}
    >
      <svg viewBox="0 0 40 40" width="72" height="72" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <rect x="14" y="4" width="12" height="22" />
        <path d="M6 30h28M28 26l6 4-6 4" />
      </svg>
      <h2 className="t-display-m">Rotate your phone</h2>
      <p>Daglei TV is made for landscape. Turn your phone sideways to watch.</p>
      <button className="btn cut" onClick={() => setDismissed(true)}>
        Continue anyway
      </button>
    </div>
  );
}

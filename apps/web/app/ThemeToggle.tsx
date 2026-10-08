"use client";

import { MoonIcon, SunIcon } from "./icons";

export const THEME_KEY = "dagleitv.theme";

/**
 * Switches between night (the product) and paper and remembers the choice.
 * Which icon shows is decided in CSS (globals.css), so it is right before hydration.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const toggle = () => {
    const next = document.documentElement.dataset.theme === "paper" ? "night" : "paper";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* not remembered, still switched */
    }
  };
  return (
    <button
      className={`btn btn-ghost ibtn cut ${className}`}
      onClick={toggle}
      aria-label="Switch night/paper theme"
      title="Switch night/paper theme"
      data-testid="theme-toggle"
    >
      <span className="theme-icon-night">
        <SunIcon />
      </span>
      <span className="theme-icon-paper">
        <MoonIcon />
      </span>
    </button>
  );
}

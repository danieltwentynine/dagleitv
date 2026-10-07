"use client";

import { MoonIcon, SunIcon } from "./icons";

export const THEME_KEY = "dagleitv.theme";

/** The theme currently showing: an explicit choice, else the system setting. */
function currentTheme(): "light" | "dark" {
  const chosen = document.documentElement.dataset.theme;
  if (chosen === "light" || chosen === "dark") return chosen;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/**
 * Switches between the dark and light themes and remembers the choice. Which
 * icon shows is decided in CSS (globals.css), so it is right before hydration.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const toggle = () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* not remembered, still switched */
    }
  };
  return (
    <button
      className={`btn btn-ghost btn-icon ${className}`}
      onClick={toggle}
      aria-label="Switch light/dark theme"
      title="Switch light/dark theme"
      data-testid="theme-toggle"
    >
      <span className="theme-icon-dark">
        <SunIcon />
      </span>
      <span className="theme-icon-light">
        <MoonIcon />
      </span>
    </button>
  );
}

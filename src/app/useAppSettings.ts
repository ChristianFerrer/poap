"use client";

import { useEffect, useState } from "react";

const SETTINGS_STORAGE_KEY = "poap-settings";

export type Theme = "dark" | "light";

interface AppSettings {
  showWeekends: boolean;
  showToday: boolean;
  theme: Theme;
  sidebarCollapsed: boolean;
  /** Whether an uncategorized phase (no stage-category tag, or one
   * pointing at a deleted stage) gets flagged amber + a warning glyph on
   * the Program page's summary row (see Phase.warning) instead of just
   * its normal status color. On by default — it's meant to surface real
   * data-quality gaps (typically straight from an Excel import) — but
   * some teams would rather not see it at all. */
  flagUncategorizedPhases: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  showWeekends: true,
  showToday: true,
  theme: "dark",
  sidebarCollapsed: false,
  flagUncategorizedPhases: true,
};

/**
 * Display preferences from the settings panel, persisted to localStorage
 * under one JSON blob (same idea as the language choice in
 * LanguageProvider). Shared by every page — Program portfolio and every
 * Project detail view all read/write the same preferences, since "should
 * weekends be tinted" isn't a per-project decision.
 */
export function useAppSettings() {
  const [showWeekends, setShowWeekends] = useState(DEFAULT_SETTINGS.showWeekends);
  const [showToday, setShowToday] = useState(DEFAULT_SETTINGS.showToday);
  const [theme, setTheme] = useState<Theme>(DEFAULT_SETTINGS.theme);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(DEFAULT_SETTINGS.sidebarCollapsed);
  const [flagUncategorizedPhases, setFlagUncategorizedPhases] = useState(DEFAULT_SETTINGS.flagUncategorizedPhases);
  // Gates the save effect below until the load effect has actually run —
  // without this, the save effect's very first pass (still holding the
  // lazy defaults, before the load effect's setState calls have committed)
  // would write those defaults over whatever was already saved, and on
  // every Project page mount that meant a fresh visit re-clobbering
  // preferences set on the Program page (or any other page) moments
  // earlier. Deliberately `useState`, not a ref: a ref would already read
  // "true" by the time this same pass's save effect runs (ref mutations
  // are synchronous, unlike setState), reintroducing the exact race this
  // is meant to prevent — state only flips for effects in the *next*
  // render, which is what actually avoids the clobber.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Partial<AppSettings>;
        if (typeof parsed.showWeekends === "boolean") setShowWeekends(parsed.showWeekends);
        if (typeof parsed.showToday === "boolean") setShowToday(parsed.showToday);
        if (parsed.theme === "dark" || parsed.theme === "light") setTheme(parsed.theme);
        if (typeof parsed.sidebarCollapsed === "boolean") setSidebarCollapsed(parsed.sidebarCollapsed);
        if (typeof parsed.flagUncategorizedPhases === "boolean") setFlagUncategorizedPhases(parsed.flagUncategorizedPhases);
      } catch {
        // Malformed/foreign localStorage value — fall back to defaults
        // rather than throw during render.
      }
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const settings: AppSettings = { showWeekends, showToday, theme, sidebarCollapsed, flagUncategorizedPhases };
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  }, [loaded, showWeekends, showToday, theme, sidebarCollapsed, flagUncategorizedPhases]);

  // Reflects the theme choice onto <html data-theme>, same attribute the
  // no-flash inline script in layout.tsx already set before this ever ran
  // — gated on `loaded` for the same reason the save effect above is: the
  // very first pass would otherwise apply the still-default "dark" state
  // and stomp the light theme that script just set for a returning user.
  useEffect(() => {
    if (!loaded) return;
    if (theme === "light") document.documentElement.setAttribute("data-theme", "light");
    else document.documentElement.removeAttribute("data-theme");
  }, [loaded, theme]);

  return {
    showWeekends,
    setShowWeekends,
    showToday,
    setShowToday,
    theme,
    setTheme,
    sidebarCollapsed,
    setSidebarCollapsed,
    flagUncategorizedPhases,
    setFlagUncategorizedPhases,
  };
}

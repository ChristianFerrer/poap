"use client";

import { useEffect, useState } from "react";
import type { NavPosition, SidePanelMode } from "./SettingsPanel";

const SETTINGS_STORAGE_KEY = "poap-settings";

interface AppSettings {
  showWeekends: boolean;
  showToday: boolean;
  sidePanelMode: SidePanelMode;
  navPosition: NavPosition;
}

const DEFAULT_SETTINGS: AppSettings = {
  showWeekends: true,
  showToday: true,
  sidePanelMode: "overlay",
  navPosition: "left",
};

/**
 * Display preferences from the settings panel, persisted to localStorage
 * under one JSON blob (same idea as the language choice in
 * LanguageProvider). Shared by every page — Program portfolio and every
 * Project detail view all read/write the same preferences, since "should
 * weekends be tinted" or "where does the nav bar live" isn't a
 * per-project decision.
 */
export function useAppSettings() {
  const [showWeekends, setShowWeekends] = useState(DEFAULT_SETTINGS.showWeekends);
  const [showToday, setShowToday] = useState(DEFAULT_SETTINGS.showToday);
  const [sidePanelMode, setSidePanelMode] = useState<SidePanelMode>(DEFAULT_SETTINGS.sidePanelMode);
  const [navPosition, setNavPosition] = useState<NavPosition>(DEFAULT_SETTINGS.navPosition);
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
        if (parsed.sidePanelMode === "overlay" || parsed.sidePanelMode === "fixed") setSidePanelMode(parsed.sidePanelMode);
        if (parsed.navPosition === "left" || parsed.navPosition === "right") setNavPosition(parsed.navPosition);
      } catch {
        // Malformed/foreign localStorage value — fall back to defaults
        // rather than throw during render.
      }
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const settings: AppSettings = { showWeekends, showToday, sidePanelMode, navPosition };
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  }, [loaded, showWeekends, showToday, sidePanelMode, navPosition]);

  return {
    showWeekends,
    setShowWeekends,
    showToday,
    setShowToday,
    sidePanelMode,
    setSidePanelMode,
    navPosition,
    setNavPosition,
  };
}

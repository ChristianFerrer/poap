"use client";

import type { ReactNode } from "react";
import { IconGateDiamond, IconHome, IconLanes, IconPanel, IconSettings, IconUploadNav } from "@/lib/icons";
import { useLanguage } from "./i18n/LanguageProvider";
import styles from "./Sidebar.module.css";

export type SidebarActive = "home" | "swimlines" | "gates" | "import" | "settings";
export type SidebarPosition = "left" | "right";

/**
 * Left/right-anchored icon nav — the app's single entry point for the
 * management panels (swimlines, stage gates, settings) plus a "home"
 * action that just clears whatever's open. Position is a display
 * preference (see useAppSettings), not something this component decides
 * for itself.
 *
 * onSwimlines/onGates are optional: the Program (portfolio) page has
 * neither concept — "teams" and "stage gates" only exist inside a single
 * project — so it only ever passes onHome/onSettings, and those two
 * buttons simply don't render there instead of pointing at nothing.
 */
export function Sidebar({
  position,
  active,
  onHome,
  onSwimlines,
  onGates,
  onImport,
  onSettings,
  showPanelToggle,
  panelVisible,
  onTogglePanel,
}: {
  position: SidebarPosition;
  active: SidebarActive;
  onHome: () => void;
  onSwimlines?: () => void;
  onGates?: () => void;
  /** Opens the Excel-import flow — a first-class menu entry (not just a
   * page-header button) since it's how a team gets a plan into the app in
   * the first place, on both the Program and Project pages. */
  onImport: () => void;
  onSettings: () => void;
  /** Only meaningful in "fixed" side-panel mode — a floating panel already
   * fully appears/disappears on its own, so this extra show/hide control
   * would be redundant there. */
  showPanelToggle: boolean;
  panelVisible: boolean;
  onTogglePanel: () => void;
}) {
  const { t } = useLanguage();
  const items: { key: SidebarActive; icon: ReactNode; ariaLabel: string; label: string; onClick: () => void }[] = [
    { key: "home", icon: <IconHome />, ariaLabel: t.sidebar.homeAria, label: t.sidebar.homeLabel, onClick: onHome },
    ...(onSwimlines
      ? [{ key: "swimlines" as const, icon: <IconLanes />, ariaLabel: t.sidebar.swimlinesAria, label: t.sidebar.swimlinesLabel, onClick: onSwimlines }]
      : []),
    ...(onGates
      ? [{ key: "gates" as const, icon: <IconGateDiamond />, ariaLabel: t.sidebar.gatesAria, label: t.sidebar.gatesLabel, onClick: onGates }]
      : []),
    { key: "import" as const, icon: <IconUploadNav />, ariaLabel: t.sidebar.importAria, label: t.sidebar.importLabel, onClick: onImport },
    { key: "settings", icon: <IconSettings />, ariaLabel: t.sidebar.settingsAria, label: t.sidebar.settingsLabel, onClick: onSettings },
  ];

  return (
    <nav
      className={`${styles.sidebar} ${position === "right" ? styles.sidebarRight : styles.sidebarLeft}`}
      aria-label={t.sidebar.navAria}
    >
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className={`${styles.navButton} ${active === item.key ? styles.navButtonActive : ""}`}
          onClick={item.onClick}
          aria-pressed={active === item.key}
          aria-label={item.ariaLabel}
        >
          {item.icon}
          <span className={styles.navLabel}>{item.label}</span>
        </button>
      ))}

      {showPanelToggle && (
        <>
          {/* Separate from the content-selector buttons above — this one
              only shows/hides the fixed panel dock, it doesn't change what
              it's showing. Explicit control for reopening it once closed
              via the panel's own X, since a docked panel (unlike the
              floating one) won't otherwise reappear on its own. */}
          <span className={styles.divider} aria-hidden="true" />
          <button
            type="button"
            className={`${styles.navButton} ${panelVisible ? styles.navButtonActive : ""}`}
            onClick={onTogglePanel}
            aria-pressed={panelVisible}
            aria-label={panelVisible ? t.sidebar.hidePanelAria : t.sidebar.showPanelAria}
          >
            <IconPanel />
            <span className={styles.navLabel}>{t.sidebar.panelLabel}</span>
          </button>
        </>
      )}
    </nav>
  );
}

"use client";

import type { ReactNode } from "react";
import { IconGateDiamond, IconHome, IconLanes, IconPanel, IconSettings } from "@/lib/icons";
import { useLanguage } from "./i18n/LanguageProvider";
import styles from "./Sidebar.module.css";

export type SidebarActive = "home" | "swimlines" | "gates" | "settings";
export type SidebarPosition = "left" | "right";

/**
 * Left/right-anchored icon nav — the app's single entry point for the
 * three management panels (swimlines, stage gates, settings) plus a "home"
 * action that just clears whatever's open. Position is a display
 * preference (see AppSettings in page.tsx), not something this component
 * decides for itself.
 */
export function Sidebar({
  position,
  active,
  onHome,
  onSwimlines,
  onGates,
  onSettings,
  showPanelToggle,
  panelVisible,
  onTogglePanel,
}: {
  position: SidebarPosition;
  active: SidebarActive;
  onHome: () => void;
  onSwimlines: () => void;
  onGates: () => void;
  onSettings: () => void;
  /** Only meaningful in "fixed" side-panel mode — a floating panel already
   * fully appears/disappears on its own, so this extra show/hide control
   * would be redundant there. */
  showPanelToggle: boolean;
  panelVisible: boolean;
  onTogglePanel: () => void;
}) {
  const { t } = useLanguage();
  const items: { key: SidebarActive; icon: ReactNode; label: string; onClick: () => void }[] = [
    { key: "home", icon: <IconHome />, label: t.sidebar.homeAria, onClick: onHome },
    { key: "swimlines", icon: <IconLanes />, label: t.sidebar.swimlinesAria, onClick: onSwimlines },
    { key: "gates", icon: <IconGateDiamond />, label: t.sidebar.gatesAria, onClick: onGates },
    { key: "settings", icon: <IconSettings />, label: t.sidebar.settingsAria, onClick: onSettings },
  ];

  return (
    <nav
      className={`${styles.sidebar} ${position === "right" ? styles.sidebarRight : styles.sidebarLeft}`}
      aria-label={t.sidebar.swimlinesAria}
    >
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className={`${styles.navButton} ${active === item.key ? styles.navButtonActive : ""}`}
          onClick={item.onClick}
          aria-pressed={active === item.key}
          aria-label={item.label}
          title={item.label}
        >
          {item.icon}
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
            title={panelVisible ? t.sidebar.hidePanelAria : t.sidebar.showPanelAria}
          >
            <IconPanel />
          </button>
        </>
      )}
    </nav>
  );
}

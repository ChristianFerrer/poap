"use client";

import type { ReactNode } from "react";
import { IconGateDiamond, IconHome, IconLanes, IconPanel, IconSettings } from "@/lib/icons";
import { useLanguage } from "./i18n/LanguageProvider";
import styles from "./Sidebar.module.css";

export type SidebarActive = "home" | "swimlines" | "gates" | "settings";
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
    ...(onSwimlines ? [{ key: "swimlines" as const, icon: <IconLanes />, label: t.sidebar.swimlinesAria, onClick: onSwimlines }] : []),
    ...(onGates ? [{ key: "gates" as const, icon: <IconGateDiamond />, label: t.sidebar.gatesAria, onClick: onGates }] : []),
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

"use client";

import type { ReactNode } from "react";
import {
  IconChevronLeft,
  IconChevronRight,
  IconImportNav,
  IconLanes,
  IconSettings,
} from "@/lib/icons";
import { useLanguage } from "./i18n/LanguageProvider";
import styles from "./Sidebar.module.css";

export type SidebarActive = "none" | "swimlines" | "import" | "settings";

/**
 * Left-anchored icon nav — the app's single entry point for the
 * management panels (swimlines, settings). Going back to the Program page
 * is the breadcrumb's job now (its first crumb always links to "/"), not a
 * dedicated rail button. Stage gates are managed inline, inside a lane's
 * own swimlines panel (see ExplorerPanel), so they never had their own
 * rail entry to remove — only their earlier standalone-panel button did.
 *
 * onSwimlines is optional: the Program (portfolio) page has no "teams"
 * concept — that only exists inside a single project — so it only ever
 * passes onImport/onSettings, and that button simply doesn't render there
 * instead of pointing at nothing.
 */
export function Sidebar({
  active,
  onSwimlines,
  onImport,
  onSettings,
  collapsed,
  onToggleCollapsed,
}: {
  active: SidebarActive;
  onSwimlines?: () => void;
  /** Opens the Excel-import flow — a first-class menu entry (not just a
   * page-header button) since it's how a team gets a plan into the app in
   * the first place, on both the Program and Project pages. */
  onImport: () => void;
  onSettings: () => void;
  /** Desktop-only rail width toggle (icon+label vs. icon-only) — the
   * caller owns persisting it (see useAppSettings), this component only
   * renders whichever state it's told. Meaningless below the mobile
   * breakpoint, where the rail becomes a bottom tab bar regardless, so
   * the toggle button itself is hidden there via CSS rather than by a
   * second prop. */
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const { t } = useLanguage();
  // Every icon here renders at its normal (never bold) weight except the
  // one matching `active` — that's the only "genuinely selected" icon in
  // the rail, so it's the only one that gets the heavier stroke (see
  // icons.tsx's REST_STROKE/ACTIVE_STROKE).
  const items: { key: SidebarActive; icon: ReactNode; ariaLabel: string; label: string; onClick: () => void }[] = [
    ...(onSwimlines
      ? [{ key: "swimlines" as const, icon: <IconLanes active={active === "swimlines"} />, ariaLabel: t.sidebar.swimlinesAria, label: t.sidebar.swimlinesLabel, onClick: onSwimlines }]
      : []),
    { key: "import" as const, icon: <IconImportNav active={active === "import"} />, ariaLabel: t.sidebar.importAria, label: t.sidebar.importLabel, onClick: onImport },
    { key: "settings", icon: <IconSettings active={active === "settings"} />, ariaLabel: t.sidebar.settingsAria, label: t.sidebar.settingsLabel, onClick: onSettings },
  ];

  return (
    <nav
      className={`${styles.sidebar} ${collapsed ? styles.sidebarCollapsed : ""}`}
      aria-label={t.sidebar.navAria}
    >
      <div className={styles.logo} title={t.sidebar.appNameHint}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a fixed
            multi-color brand mark, not a themeable single-color icon, so
            it doesn't go through icons.tsx's currentColor-based icon()
            wrapper like every other sidebar icon does. */}
        <img src="/forest.svg" alt="" className={styles.logoMark} />
        <span className={styles.logoText}>{t.sidebar.appName}</span>
      </div>

      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className={`${styles.navButton} ${active === item.key ? styles.navButtonActive : ""}`}
          onClick={item.onClick}
          aria-pressed={active === item.key}
          aria-label={item.ariaLabel}
          title={collapsed ? item.label : undefined}
        >
          {item.icon}
          <span className={styles.navLabel}>{item.label}</span>
        </button>
      ))}

      <span className={styles.spacer} aria-hidden="true" />

      <button
        type="button"
        className={styles.collapseToggle}
        onClick={onToggleCollapsed}
        aria-pressed={collapsed}
        aria-label={collapsed ? t.sidebar.expandAria : t.sidebar.collapseAria}
        title={collapsed ? t.sidebar.expandAria : t.sidebar.collapseAria}
      >
        {collapsed ? <IconChevronRight /> : <IconChevronLeft />}
      </button>
    </nav>
  );
}

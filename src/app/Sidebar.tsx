"use client";

import type { ReactNode } from "react";
import {
  IconAlertTriangle,
  IconChevronLeft,
  IconChevronRight,
  IconGateDiamond,
  IconHome,
  IconImportNav,
  IconLanes,
  IconSettings,
} from "@/lib/icons";
import { useLanguage } from "./i18n/LanguageProvider";
import styles from "./Sidebar.module.css";

export type SidebarActive = "home" | "swimlines" | "gates" | "import" | "settings";

/**
 * Left-anchored icon nav — the app's single entry point for the
 * management panels (swimlines, stage gates, settings) plus a "home"
 * action that just clears whatever's open.
 *
 * onSwimlines/onGates are optional: the Program (portfolio) page has
 * neither concept — "teams" and "stage gates" only exist inside a single
 * project — so it only ever passes onHome/onSettings, and those two
 * buttons simply don't render there instead of pointing at nothing.
 */
export function Sidebar({
  active,
  onHome,
  onSwimlines,
  onGates,
  onImport,
  onSettings,
  issuesCount = 0,
  onIssuesClick,
  collapsed,
  onToggleCollapsed,
}: {
  active: SidebarActive;
  onHome: () => void;
  onSwimlines?: () => void;
  onGates?: () => void;
  /** Opens the Excel-import flow — a first-class menu entry (not just a
   * page-header button) since it's how a team gets a plan into the app in
   * the first place, on both the Program and Project pages. */
  onImport: () => void;
  onSettings: () => void;
  /** Count of tracks missing a required parent (no plan-lane category, or
   * no Plan) — rendered as a permanent badge in the rail itself rather
   * than inside any one panel, so it can never be closed, buried, or
   * covered by an open panel. Omit (or 0) to render nothing; the Program
   * page has no lanes of its own yet, so it simply never passes this. */
  issuesCount?: number;
  onIssuesClick?: () => void;
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
    { key: "home", icon: <IconHome active={active === "home"} />, ariaLabel: t.sidebar.homeAria, label: t.sidebar.homeLabel, onClick: onHome },
    ...(onSwimlines
      ? [{ key: "swimlines" as const, icon: <IconLanes active={active === "swimlines"} />, ariaLabel: t.sidebar.swimlinesAria, label: t.sidebar.swimlinesLabel, onClick: onSwimlines }]
      : []),
    ...(onGates
      ? [{ key: "gates" as const, icon: <IconGateDiamond active={active === "gates"} />, ariaLabel: t.sidebar.gatesAria, label: t.sidebar.gatesLabel, onClick: onGates }]
      : []),
    { key: "import" as const, icon: <IconImportNav active={active === "import"} />, ariaLabel: t.sidebar.importAria, label: t.sidebar.importLabel, onClick: onImport },
    { key: "settings", icon: <IconSettings active={active === "settings"} />, ariaLabel: t.sidebar.settingsAria, label: t.sidebar.settingsLabel, onClick: onSettings },
  ];

  return (
    <nav
      className={`${styles.sidebar} ${collapsed ? styles.sidebarCollapsed : ""}`}
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
          title={collapsed ? item.label : undefined}
        >
          {item.icon}
          <span className={styles.navLabel}>{item.label}</span>
        </button>
      ))}

      <span className={styles.spacer} aria-hidden="true" />

      {issuesCount > 0 && onIssuesClick && (
        <button
          type="button"
          className={styles.issuesButton}
          onClick={onIssuesClick}
          aria-label={t.linkage.bannerTitle + " — " + t.linkage.count(issuesCount)}
          title={t.linkage.bannerTitle}
        >
          <IconAlertTriangle />
          <span className={styles.issuesCount}>{issuesCount}</span>
        </button>
      )}

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

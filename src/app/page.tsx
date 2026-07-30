"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PoapRenderer } from "@/components/poap-renderer/PoapRenderer";
import { PROGRAM } from "./mock-data";
import { deriveProgramLanes } from "@/lib/portfolio";
import { SettingsPanel, type SidePanelMode } from "./SettingsPanel";
import { Sidebar, type SidebarActive } from "./Sidebar";
import { LanguageSwitch } from "./LanguageSwitch";
import { useAppSettings } from "./useAppSettings";
import { useSidePanel } from "./useSidePanel";
import { useLanguage } from "./i18n/LanguageProvider";
import { MONTH_ABBR } from "@/lib/i18n";
import { formatMonthRange } from "./formatMonthRange";
import styles from "./page.module.css";

/**
 * Program (portfolio) view — the top of the Program → Project → Phase
 * hierarchy. Renders one Gantt bar per project (PoapRenderer reused as-is:
 * "lane" here means "project", not "team"), with each project's own
 * SIT/UAT/TCO/… summary bars derived automatically from whatever its teams
 * already tagged (see deriveProgramLanes in src/lib/portfolio.ts) — nobody
 * maintains a second, parallel executive-summary calendar by hand.
 * Clicking a project's name drills into its own detail page
 * (src/app/project/[projectId]/page.tsx), which is exactly the single-
 * project experience this app started as.
 */
export default function ProgramPage() {
  const { locale, setLocale, t } = useLanguage();
  const router = useRouter();
  const settings = useAppSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const lanes = useMemo(() => deriveProgramLanes(PROGRAM, locale), [locale]);

  const sidePanel = useSidePanel({
    sidePanelMode: settings.sidePanelMode,
    isOpen: settingsOpen,
    onCloseAll: () => setSettingsOpen(false),
  });

  function openSettingsPanel() {
    setSettingsOpen(true);
    sidePanel.revealFixedPanel();
    sidePanel.scrollToPanel();
  }

  // "Home" always means "just the calendar", regardless of side-panel mode.
  function goHome() {
    setSettingsOpen(false);
    sidePanel.hideFixedPanel();
  }

  // Switching into "fixed" mode while Settings was already open should
  // dock it visibly right away, not silently drop it.
  function handleSidePanelModeChange(mode: SidePanelMode) {
    settings.setSidePanelMode(mode);
    if (mode === "fixed" && settingsOpen) sidePanel.revealFixedPanel();
  }

  function openProject(projectId: string) {
    router.push(`/project/${projectId}`);
  }

  const sidebarActive: SidebarActive = settingsOpen ? "settings" : "home";

  const panelContent = settingsOpen ? (
    <SettingsPanel
      ref={sidePanel.panelRef}
      showWeekends={settings.showWeekends}
      onShowWeekendsChange={settings.setShowWeekends}
      showToday={settings.showToday}
      onShowTodayChange={settings.setShowToday}
      sidePanelMode={settings.sidePanelMode}
      onSidePanelModeChange={handleSidePanelModeChange}
      navPosition={settings.navPosition}
      onNavPositionChange={settings.setNavPosition}
      onClose={sidePanel.closePanel}
    />
  ) : null;

  return (
    <>
      <Sidebar
        position={settings.navPosition}
        active={sidebarActive}
        onHome={goHome}
        onSettings={openSettingsPanel}
        showPanelToggle={settings.sidePanelMode === "fixed"}
        panelVisible={sidePanel.fixedPanelVisible}
        onTogglePanel={sidePanel.toggleFixedPanel}
      />
      <main className={`${styles.main} ${settings.navPosition === "left" ? styles.mainNavLeft : styles.mainNavRight}`}>
        <div className={styles.headerRow}>
          <div>
            <p className={styles.eyebrow}>{t.header.eyebrow}</p>
            <h1 className={styles.title}>{t.header.programTitle(PROGRAM.name)}</h1>
            <p className={styles.meta}>
              {PROGRAM.projects.length} {t.header.projectsWord} · {PROGRAM.months} {t.header.monthsWord} ·{" "}
              {formatMonthRange(PROGRAM.startMonth, PROGRAM.months, MONTH_ABBR[locale])}
            </p>
          </div>
          <div className={styles.headerActions}>
            <LanguageSwitch locale={locale} onChange={setLocale} ariaLabel={t.header.languageAria} />
          </div>
        </div>

        <div className={`${styles.layout} ${settings.sidePanelMode === "fixed" ? styles.layoutStacked : ""}`}>
          <div className={styles.calendarCol}>
            <PoapRenderer
              months={PROGRAM.months}
              startMonth={PROGRAM.startMonth}
              lanes={lanes}
              onLaneClick={openProject}
              locale={locale}
              showWeekends={settings.showWeekends}
              showToday={settings.showToday}
            />
          </div>

          {/* "Fixed" side-panel mode: a normal flex sibling of the calendar,
              docked (never overlaying it), only actually rendered while
              fixedPanelVisible so the calendar reclaims the full width
              instead of a docked-but-empty box sitting there. */}
          {settings.sidePanelMode === "fixed" && sidePanel.fixedPanelVisible && (
            <div className={styles.sidePanelFixed} style={{ width: sidePanel.panelWidth }}>
              <div
                className={styles.resizeHandle}
                onMouseDown={sidePanel.startResize}
                role="separator"
                aria-orientation="vertical"
                aria-label={t.header.resizeHandleAria}
              />
              <div className={styles.sidePanelContent}>
                {panelContent ?? <p className={styles.emptyPanel}>{t.settings.emptyPanel}</p>}
              </div>
            </div>
          )}
        </div>

        {/* "Overlay" side-panel mode (the default): fixed, right-anchored,
            not part of the flex layout above, so it floats over the
            calendar instead of squeezing it. Only rendered while Settings
            is actually open, and closes on an outside click. */}
        {settings.sidePanelMode === "overlay" && settingsOpen && (
          <div ref={sidePanel.sidePanelWrapperRef} className={styles.sidePanel} style={{ width: sidePanel.panelWidth }}>
            <div
              className={styles.resizeHandle}
              onMouseDown={sidePanel.startResize}
              role="separator"
              aria-orientation="vertical"
              aria-label={t.header.resizeHandleAria}
            />
            <div className={styles.sidePanelContent}>{panelContent}</div>
          </div>
        )}
      </main>
    </>
  );
}

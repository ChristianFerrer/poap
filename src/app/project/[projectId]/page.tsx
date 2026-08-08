"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PoapRenderer } from "@/components/poap-renderer/PoapRenderer";
import type { Gate, Lane } from "@/components/poap-renderer/types";
import type { Project } from "@/lib/portfolio";
import { BANDS, PROGRAM } from "../../mock-data";
import { useProjects } from "../../ProjectsProvider";
import { useProjectSwimlines } from "../../useProjectSwimlines";
import { ExplorerPanel, type ExplorerView } from "../../ExplorerPanel";
import { GatesPanel } from "../../GatesPanel";
import { ImportPanel } from "../../ImportPanel";
import { SettingsPanel, type SidePanelMode } from "../../SettingsPanel";
import { Sidebar, type SidebarActive } from "../../Sidebar";
import { useAppSettings } from "../../useAppSettings";
import { useSidePanel } from "../../useSidePanel";
import { useLanguage } from "../../i18n/LanguageProvider";
import { MONTH_ABBR } from "@/lib/i18n";
import { formatMonthRange } from "../../formatMonthRange";
import styles from "../../page.module.css";

/**
 * Project detail view — the middle level of the Program → Project → Phase
 * hierarchy. This is the original single-project PoAP experience the app
 * started as (swimlanes = teams, phases, drill-down to activities),
 * scoped to whichever project the Program page's calendar was clicked
 * into. Lanes/gates/activities all live in ProjectsProvider (not local
 * component state), so edits here — and any project created from the
 * Program page — survive navigating away and back. Still no real backend
 * though: everything resets on a hard reload.
 */
export default function ProjectPage({ params }: { params: { projectId: string } }) {
  const { projects, loaded } = useProjects();
  const project = projects.find((p) => p.id === params.projectId);
  const { t } = useLanguage();

  if (!loaded) {
    return (
      <main className={styles.main}>
        <p className={styles.meta}>{t.header.loading}</p>
      </main>
    );
  }

  if (!project) {
    return (
      <main className={styles.main}>
        <p className={styles.eyebrow}>{t.header.eyebrow}</p>
        <h1 className={styles.title}>{params.projectId}</h1>
        <Link href="/" className={styles.meta}>
          {t.header.backToProgram}
        </Link>
      </main>
    );
  }

  return <ProjectView project={project} />;
}

function ProjectView({ project }: { project: Project }) {
  const { locale, t } = useLanguage();
  const router = useRouter();
  const settings = useAppSettings();
  const {
    projects,
    deleteProject,
    setProjectLanes,
    setProjectGates,
    commentsByActivity,
    addComment,
    stageCategories,
    addStageCategory,
    renameStageCategory,
    deleteStageCategory,
    announceUndo,
  } = useProjects();
  const {
    explorer,
    setExplorer,
    getActivities,
    addLane,
    updatePhase,
    addPhase,
    deleteLane,
    deletePhase,
    addActivity,
    deleteActivity,
  } = useProjectSwimlines(project);

  const lanes = project.lanes;
  const gates = project.gates;
  const [activeGateIds, setActiveGateIds] = useState<string[]>([]);

  const [gatesPanelOpen, setGatesPanelOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const phaseCount = lanes.reduce((n, l) => n + l.phases.length, 0);

  function closeAllPanels() {
    setExplorer(null);
    setGatesPanelOpen(false);
    setImportOpen(false);
    setSettingsOpen(false);
  }

  const anyPanelOpen = Boolean(explorer || gatesPanelOpen || importOpen || settingsOpen);
  const sidePanel = useSidePanel({
    sidePanelMode: settings.sidePanelMode,
    isOpen: anyPanelOpen,
    onCloseAll: closeAllPanels,
  });

  // The bar shown "selected" in the chart mirrors whichever phase the
  // explorer is currently drilled into, so it stays highlighted while you
  // browse its activities — not just at the instant you click it.
  const selectedPhaseId =
    explorer?.level === "activities" || explorer?.level === "activity" ? explorer.phaseId : null;

  function openExplorer(view: ExplorerView) {
    setExplorer(view);
    setGatesPanelOpen(false);
    setImportOpen(false);
    setSettingsOpen(false);
    sidePanel.revealFixedPanel();
    sidePanel.scrollToPanel();
  }

  function openImportPanel() {
    setImportOpen(true);
    setExplorer(null);
    setGatesPanelOpen(false);
    setSettingsOpen(false);
    sidePanel.revealFixedPanel();
    sidePanel.scrollToPanel();
  }

  function openSettingsPanel() {
    setSettingsOpen(true);
    setExplorer(null);
    setGatesPanelOpen(false);
    setImportOpen(false);
    sidePanel.revealFixedPanel();
    sidePanel.scrollToPanel();
  }

  // "Home" always means "just this project's calendar", regardless of
  // side-panel mode — it does not navigate back up to the Program page,
  // that's what the breadcrumb link is for.
  function goHome() {
    closeAllPanels();
    sidePanel.hideFixedPanel();
  }

  // Switching into "fixed" mode while something was already open should
  // dock it visibly right away, not silently drop it.
  function handleSidePanelModeChange(mode: SidePanelMode) {
    settings.setSidePanelMode(mode);
    if (mode === "fixed" && anyPanelOpen) sidePanel.revealFixedPanel();
  }

  function importLanes(newLanes: Lane[]) {
    setProjectLanes(project.id, (prev) => [...prev, ...newLanes.map((lane, i) => ({ ...lane, sortOrder: prev.length + i }))]);
  }

  function handlePhaseClick(phaseId: string) {
    openExplorer({ level: "activities", phaseId });
  }

  function handleLaneClick(laneId: string) {
    openExplorer({ level: "phases", laneId });
  }

  function toggleGateActive(gateId: string) {
    setActiveGateIds((prev) => (prev.includes(gateId) ? prev.filter((id) => id !== gateId) : [...prev, gateId]));
  }

  function handleGateClick(gateId: string) {
    toggleGateActive(gateId);
    setExplorer(null);
    setImportOpen(false);
    setSettingsOpen(false);
    setGatesPanelOpen(true);
    sidePanel.revealFixedPanel();
    sidePanel.scrollToPanel();
  }

  // Opens the gates panel without toggling any one gate's visibility —
  // for clicking the "Stage gates" row label itself, same idea as
  // handleLaneClick opening a lane's phases.
  function openGatesPanel() {
    setExplorer(null);
    setImportOpen(false);
    setSettingsOpen(false);
    setGatesPanelOpen(true);
    sidePanel.revealFixedPanel();
    sidePanel.scrollToPanel();
  }

  function updateGate(id: string, patch: Partial<Pick<Gate, "label" | "position">>) {
    setProjectGates(project.id, (prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  }

  function addGate(gate: Gate) {
    setProjectGates(project.id, (prev) => [...prev, gate]);
  }

  function deleteGate(id: string) {
    const index = gates.findIndex((g) => g.id === id);
    if (index === -1) return;
    const removed = gates[index]!;
    setProjectGates(project.id, (prev) => prev.filter((g) => g.id !== id));
    setActiveGateIds((prev) => prev.filter((gid) => gid !== id));
    announceUndo(t.undo.gateDeleted(removed.label), () => {
      setProjectGates(project.id, (prev) => {
        const next = [...prev];
        next.splice(index, 0, removed);
        return next;
      });
    });
  }

  // Deleting the project currently being viewed can't just update state
  // and stay put — this page's own `project` lookup would immediately
  // start failing every render — so it navigates back to the Program page
  // in the same action. Deleting any other project from here (Settings
  // lists every project, not just this one) just updates state in place.
  function handleDeleteProject(id: string) {
    deleteProject(id);
    if (id === project.id) router.push("/");
  }

  const sidebarActive: SidebarActive = settingsOpen
    ? "settings"
    : gatesPanelOpen
      ? "gates"
      : explorer
        ? "swimlines"
        : "home";

  const panelContent = explorer ? (
    <ExplorerPanel
      ref={sidePanel.panelRef}
      lanes={lanes}
      startMonth={PROGRAM.startMonth}
      view={explorer}
      stageCategories={stageCategories}
      getActivities={getActivities}
      onNavigate={setExplorer}
      onClose={sidePanel.closePanel}
      onAddLane={addLane}
      onUpdatePhase={updatePhase}
      onAddPhase={addPhase}
      onAddActivity={addActivity}
      onDeleteLane={deleteLane}
      onDeletePhase={deletePhase}
      onDeleteActivity={deleteActivity}
      commentsByActivity={commentsByActivity}
      onAddComment={addComment}
    />
  ) : gatesPanelOpen ? (
    <GatesPanel
      ref={sidePanel.panelRef}
      gates={gates}
      activeGateIds={new Set(activeGateIds)}
      startMonth={PROGRAM.startMonth}
      onClose={sidePanel.closePanel}
      onToggle={toggleGateActive}
      onUpdate={updateGate}
      onAdd={addGate}
      onDelete={deleteGate}
    />
  ) : importOpen ? (
    <ImportPanel
      ref={sidePanel.panelRef}
      startMonth={PROGRAM.startMonth}
      months={PROGRAM.months}
      onClose={sidePanel.closePanel}
      onImport={importLanes}
    />
  ) : settingsOpen ? (
    <SettingsPanel
      ref={sidePanel.panelRef}
      theme={settings.theme}
      onThemeChange={settings.setTheme}
      showWeekends={settings.showWeekends}
      onShowWeekendsChange={settings.setShowWeekends}
      showToday={settings.showToday}
      onShowTodayChange={settings.setShowToday}
      sidePanelMode={settings.sidePanelMode}
      onSidePanelModeChange={handleSidePanelModeChange}
      navPosition={settings.navPosition}
      onNavPositionChange={settings.setNavPosition}
      stageCategories={stageCategories}
      onAddStageCategory={addStageCategory}
      onRenameStageCategory={renameStageCategory}
      onDeleteStageCategory={deleteStageCategory}
      projects={projects}
      onDeleteProject={handleDeleteProject}
      onClose={sidePanel.closePanel}
    />
  ) : null;

  return (
    <>
      <Sidebar
        position={settings.navPosition}
        active={sidebarActive}
        onHome={goHome}
        onSwimlines={() => openExplorer({ level: "lanes" })}
        onGates={openGatesPanel}
        onSettings={openSettingsPanel}
        showPanelToggle={settings.sidePanelMode === "fixed"}
        panelVisible={sidePanel.fixedPanelVisible}
        onTogglePanel={sidePanel.toggleFixedPanel}
      />
      <main className={`${styles.main} ${settings.navPosition === "left" ? styles.mainNavLeft : styles.mainNavRight}`}>
        <div className={styles.headerRow}>
          <div>
            <Link href="/" className={styles.eyebrow}>
              {t.header.backToProgram}
            </Link>
            <h1 className={styles.title}>{t.header.projectTitle(project.name)}</h1>
            <p className={styles.meta}>
              {lanes.length} {t.header.lanesWord} · {phaseCount} {t.header.phasesWord} · {PROGRAM.months}{" "}
              {t.header.monthsWord} · {formatMonthRange(PROGRAM.startMonth, PROGRAM.months, MONTH_ABBR[locale])}
            </p>
          </div>
          <div className={styles.headerActions}>
            <button type="button" className={styles.importButton} onClick={openImportPanel}>
              {t.header.importButton}
            </button>
          </div>
        </div>

        <div className={`${styles.layout} ${settings.sidePanelMode === "fixed" ? styles.layoutStacked : ""}`}>
          <div className={styles.calendarCol}>
            <PoapRenderer
              months={PROGRAM.months}
              startMonth={PROGRAM.startMonth}
              lanes={lanes}
              gates={gates}
              bands={BANDS}
              selectedPhaseId={selectedPhaseId}
              onPhaseClick={handlePhaseClick}
              activeGateIds={activeGateIds}
              onGateClick={handleGateClick}
              onLaneClick={handleLaneClick}
              onGatesLabelClick={openGatesPanel}
              locale={locale}
              showWeekends={settings.showWeekends}
              showToday={settings.showToday}
            />
          </div>

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

        {settings.sidePanelMode === "overlay" && anyPanelOpen && (
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

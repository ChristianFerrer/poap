"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PoapRenderer } from "@/components/poap-renderer/PoapRenderer";
import type { Gate, Lane, Phase } from "@/components/poap-renderer/types";
import type { Project } from "@/lib/portfolio";
import { BANDS, PROGRAM, activitiesFor, type ActivitySeed } from "../../mock-data";
import { useProjects } from "../../ProjectsProvider";
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
    activitiesByPhase,
    updatePhaseActivities,
    commentsByActivity,
    addComment,
    stageCategories,
    addStageCategory,
    renameStageCategory,
    deleteStageCategory,
    announceUndo,
  } = useProjects();

  const lanes = project.lanes;
  const gates = project.gates;
  const [activeGateIds, setActiveGateIds] = useState<string[]>([]);

  const [explorer, setExplorer] = useState<ExplorerView | null>(null);
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

  function addLane(name: string) {
    setProjectLanes(project.id, (prev) => [...prev, { id: crypto.randomUUID(), name, sortOrder: prev.length, phases: [] }]);
  }

  function updatePhase(laneId: string, phaseId: string, patch: Partial<Pick<Phase, "title" | "start" | "end" | "status" | "category">>) {
    setProjectLanes(project.id, (prev) =>
      prev.map((lane) =>
        lane.id !== laneId
          ? lane
          : { ...lane, phases: lane.phases.map((p) => (p.id === phaseId ? { ...p, ...patch } : p)) },
      ),
    );
  }

  function addPhase(laneId: string, phase: Phase) {
    setProjectLanes(project.id, (prev) => prev.map((lane) => (lane.id === laneId ? { ...lane, phases: [...lane.phases, phase] } : lane)));
  }

  function deleteLane(laneId: string) {
    const index = lanes.findIndex((l) => l.id === laneId);
    if (index === -1) return;
    const lane = lanes[index]!;
    const deletedPhaseIds = new Set(lane.phases.map((p) => p.id));
    const removedActivities: Record<string, ActivitySeed[]> = {};
    for (const phaseId of deletedPhaseIds) {
      if (phaseId in activitiesByPhase) removedActivities[phaseId] = activitiesByPhase[phaseId]!;
    }
    setProjectLanes(project.id, (prev) => prev.filter((l) => l.id !== laneId));
    for (const phaseId of Object.keys(removedActivities)) {
      updatePhaseActivities(phaseId, () => []);
    }
    setExplorer((prev) => {
      if (!prev || prev.level === "lanes") return prev;
      if (prev.level === "phases") return prev.laneId === laneId ? { level: "lanes" } : prev;
      const wasUnderDeletedLane = lane.phases.some((p) => p.id === prev.phaseId);
      return wasUnderDeletedLane ? { level: "lanes" } : prev;
    });
    announceUndo(t.undo.laneDeleted(lane.name), () => {
      setProjectLanes(project.id, (prev) => {
        const next = [...prev];
        next.splice(index, 0, lane);
        return next;
      });
      for (const [phaseId, activities] of Object.entries(removedActivities)) {
        updatePhaseActivities(phaseId, () => activities);
      }
    });
  }

  function getActivities(phase: Phase): ActivitySeed[] {
    return activitiesByPhase[phase.id] ?? activitiesFor(phase);
  }

  function deletePhase(laneId: string, phaseId: string) {
    const lane = lanes.find((l) => l.id === laneId);
    const phaseIndex = lane?.phases.findIndex((p) => p.id === phaseId) ?? -1;
    if (!lane || phaseIndex === -1) return;
    const phase = lane.phases[phaseIndex]!;
    const removedActivities = activitiesByPhase[phaseId];
    setProjectLanes(project.id, (prev) =>
      prev.map((l) => (l.id === laneId ? { ...l, phases: l.phases.filter((p) => p.id !== phaseId) } : l)),
    );
    if (removedActivities) updatePhaseActivities(phaseId, () => []);
    setExplorer((prev) => {
      if (!prev || prev.level === "lanes" || prev.level === "phases") return prev;
      return prev.phaseId === phaseId ? { level: "phases", laneId } : prev;
    });
    announceUndo(t.undo.phaseDeleted(phase.title), () => {
      setProjectLanes(project.id, (prev) =>
        prev.map((l) => {
          if (l.id !== laneId) return l;
          const nextPhases = [...l.phases];
          nextPhases.splice(phaseIndex, 0, phase);
          return { ...l, phases: nextPhases };
        }),
      );
      if (removedActivities) updatePhaseActivities(phaseId, () => removedActivities);
    });
  }

  function addActivity(phase: Phase, activity: ActivitySeed) {
    updatePhaseActivities(phase.id, (prev) => [...(prev ?? activitiesFor(phase)), activity]);
  }

  function deleteActivity(phase: Phase, activityId: string) {
    const activities = getActivities(phase);
    const index = activities.findIndex((a) => a.id === activityId);
    if (index === -1) return;
    const removed = activities[index]!;
    updatePhaseActivities(phase.id, () => activities.filter((a) => a.id !== activityId));
    setExplorer((prev) =>
      prev && prev.level === "activity" && prev.activityId === activityId ? { level: "activities", phaseId: phase.id } : prev,
    );
    announceUndo(t.undo.activityDeleted(removed.title), () => {
      updatePhaseActivities(phase.id, (prev) => {
        const current = prev ?? activitiesFor(phase);
        const next = [...current];
        next.splice(index, 0, removed);
        return next;
      });
    });
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

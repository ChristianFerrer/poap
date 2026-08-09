"use client";

import { useState } from "react";
import Link from "next/link";
import { PoapRenderer } from "@/components/poap-renderer/PoapRenderer";
import type { Lane } from "@/components/poap-renderer/types";
import { useProjects } from "@/app/ProjectsProvider";
import { useProjectSwimlines } from "@/app/useProjectSwimlines";
import { ExplorerPanel, type ExplorerView } from "@/app/ExplorerPanel";
import { SettingsPanel } from "@/app/SettingsPanel";
import { Sidebar } from "@/app/Sidebar";
import { useAppSettings } from "@/app/useAppSettings";
import { useSidePanel } from "@/app/useSidePanel";
import { useLanguage } from "@/app/i18n/LanguageProvider";
import { MONTH_ABBR } from "@/lib/i18n";
import { formatMonthRange } from "@/app/formatMonthRange";
import { IconGantt } from "@/lib/icons";
import styles from "@/app/page.module.css";

const UNASSIGNED_ID = "__unassigned__";

/**
 * Plan -> Fases: a single swimline (the Plan itself) packing its own real
 * phases, exactly like any team lane does today — reuses ExplorerPanel
 * wholesale for add/edit/delete-phase and the activities/comments drill-
 * down, wrapped so every call targets the *real* team lane (see
 * realLaneId below) instead of this page's synthetic one. The synthetic
 * lane is prepended to the real project.lanes passed into ExplorerPanel
 * (not swapped in alone) so category-suggestion can still find the
 * project's actual isProjectPlan anchor lane.
 */
export default function PlanPage({ params }: { params: { projectId: string; laneId: string; planId: string } }) {
  const {
    loaded,
    program,
    updateProgram,
    projects,
    deleteProject,
    plansByLane,
    commentsByActivity,
    addComment,
    stageCategories,
    addStageCategory,
    renameStageCategory,
    deleteStageCategory,
  } = useProjects();
  const { locale, t } = useLanguage();
  const settings = useAppSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftRange, setDraftRange] = useState<{ laneId: string; start: number; end: number } | null>(null);

  const project = projects.find((p) => p.id === params.projectId);
  const lane = project?.lanes.find((l) => l.id === params.laneId);
  const plans = plansByLane[params.laneId] ?? [];
  const isUnassigned = params.planId === UNASSIGNED_ID;
  const plan = isUnassigned ? null : plans.find((p) => p.id === params.planId);

  const swim = useProjectSwimlines(project ?? { id: "", name: "", sortOrder: 0, lanes: [], gates: [] });
  const { explorer, setExplorer, getActivities, updatePhase, addPhase, deletePhase, addActivity, deleteActivity } = swim;

  const sidePanel = useSidePanel({
    sidePanelMode: settings.sidePanelMode,
    isOpen: Boolean(explorer) || settingsOpen,
    onCloseAll: () => {
      setExplorer(null);
      setSettingsOpen(false);
    },
  });

  if (!loaded) {
    return (
      <main className={styles.main}>
        <p className={styles.meta}>{t.header.loading}</p>
      </main>
    );
  }

  if (!project || !lane || (!isUnassigned && !plan)) {
    return (
      <main className={styles.main}>
        <p className={styles.eyebrow}>{t.header.eyebrow}</p>
        <h1 className={styles.title}>{params.planId}</h1>
        <Link href={project ? `/project/${project.id}/lane/${params.laneId}` : "/"} className={styles.meta}>
          {t.header.backToProgram}
        </Link>
      </main>
    );
  }

  const planName = isUnassigned ? t.plansNav.unassignedPlanLabel : plan!.name;
  const phases = lane.phases.filter((p) =>
    isUnassigned ? !p.planId || !plans.some((pl) => pl.id === p.planId) : p.planId === params.planId,
  );
  const syntheticLane: Lane = { id: params.planId, name: planName, sortOrder: 0, phases };
  // Real project lanes come after the synthetic one so category-suggestion
  // (which looks for the real isProjectPlan lane) still works, while
  // findPhase still resolves this Plan's own phases against the synthetic
  // copy first.
  const explorerLanes: Lane[] = [syntheticLane, ...project.lanes];

  function openExplorer(view: ExplorerView) {
    setExplorer(view);
    setSettingsOpen(false);
    sidePanel.revealFixedPanel();
    sidePanel.scrollToPanel();
  }

  function openSettingsPanel() {
    setExplorer(null);
    setSettingsOpen(true);
    sidePanel.revealFixedPanel();
    sidePanel.scrollToPanel();
  }

  function goHome() {
    setExplorer(null);
    setSettingsOpen(false);
    sidePanel.hideFixedPanel();
  }

  function handlePhaseClick(phaseId: string) {
    openExplorer({ level: "activities", phaseId });
  }

  function handleCreatePhase(_syntheticLaneId: string, start: number, end: number) {
    setDraftRange({ laneId: params.planId, start, end });
    openExplorer({ level: "phases", laneId: params.planId });
  }

  // Every phase mutation ExplorerPanel fires targets whatever laneId it
  // was given (our synthetic Plan id) — these wrappers redirect it at the
  // *real* team lane (params.laneId) instead, since that's the only lane
  // actually persisted, tagging/untagging planId as needed.
  function handleAddPhase(_syntheticLaneId: string, phase: Parameters<typeof addPhase>[1]) {
    addPhase(params.laneId, { ...phase, planId: isUnassigned ? undefined : params.planId });
  }
  function handleUpdatePhase(_syntheticLaneId: string, phaseId: string, patch: Parameters<typeof updatePhase>[2]) {
    updatePhase(params.laneId, phaseId, patch);
  }
  function handleDeletePhase(_syntheticLaneId: string, phaseId: string) {
    deletePhase(params.laneId, phaseId);
  }

  const selectedPhaseId = explorer?.level === "activities" || explorer?.level === "activity" ? explorer.phaseId : null;

  const panelContent = explorer ? (
    <ExplorerPanel
      ref={sidePanel.panelRef}
      lanes={explorerLanes}
      startMonth={program.startMonth}
      view={explorer}
      stageCategories={stageCategories}
      getActivities={getActivities}
      onNavigate={setExplorer}
      onClose={sidePanel.closePanel}
      onAddLane={() => {}}
      onRenameLane={() => {}}
      draftRange={draftRange}
      onDraftRangeConsumed={() => setDraftRange(null)}
      onUpdatePhase={handleUpdatePhase}
      onAddPhase={handleAddPhase}
      onAddActivity={addActivity}
      onDeleteLane={() => {}}
      onDeletePhase={handleDeletePhase}
      onDeleteActivity={deleteActivity}
      commentsByActivity={commentsByActivity}
      onAddComment={addComment}
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
      onSidePanelModeChange={settings.setSidePanelMode}
      navPosition={settings.navPosition}
      onNavPositionChange={settings.setNavPosition}
      stageCategories={stageCategories}
      onAddStageCategory={addStageCategory}
      onRenameStageCategory={renameStageCategory}
      onDeleteStageCategory={deleteStageCategory}
      program={program}
      onUpdateProgram={updateProgram}
      projects={projects}
      onDeleteProject={deleteProject}
      onClose={sidePanel.closePanel}
    />
  ) : null;

  const anyPanelOpen = Boolean(explorer) || settingsOpen;

  return (
    <>
      <Sidebar
        position={settings.navPosition}
        active={settingsOpen ? "settings" : explorer ? "swimlines" : "home"}
        onHome={goHome}
        onImport={goHome}
        onSettings={openSettingsPanel}
        showPanelToggle={settings.sidePanelMode === "fixed"}
        panelVisible={sidePanel.fixedPanelVisible}
        onTogglePanel={sidePanel.toggleFixedPanel}
      />
      <main className={`${styles.main} ${settings.navPosition === "left" ? styles.mainNavLeft : styles.mainNavRight}`}>
        <div className={styles.headerRow}>
          <div>
            <Link href={`/project/${project.id}/lane/${params.laneId}`} className={styles.eyebrow}>
              {t.plansNav.backToLane(lane.name)}
            </Link>
            <h1 className={styles.title}>{t.plansNav.fasesTitle(planName)}</h1>
            <p className={styles.meta}>
              {phases.length} {phases.length === 1 ? t.explorer.phaseOne : t.explorer.phaseOther} ·{" "}
              {formatMonthRange(program.startMonth, program.months, MONTH_ABBR[locale])}
            </p>
          </div>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.importButton}
              onClick={() => openExplorer({ level: "phases", laneId: params.planId })}
            >
              <IconGantt /> {t.explorer.addPhaseSection}
            </button>
          </div>
        </div>

        <div className={`${styles.layout} ${settings.sidePanelMode === "fixed" ? styles.layoutStacked : ""}`}>
          <div className={styles.calendarCol}>
            <PoapRenderer
              months={program.months}
              startMonth={program.startMonth}
              lanes={[syntheticLane]}
              selectedPhaseId={selectedPhaseId}
              onPhaseClick={handlePhaseClick}
              onCreatePhase={handleCreatePhase}
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
              <div className={styles.sidePanelContent}>{panelContent}</div>
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

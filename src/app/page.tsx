"use client";

import { useMemo, useState, type Ref } from "react";
import { useRouter } from "next/navigation";
import { PoapRenderer } from "@/components/poap-renderer/PoapRenderer";
import type { Lane } from "@/components/poap-renderer/types";
import { deriveProgramLanes, type Project, type StageCategoryDef } from "@/lib/portfolio";
import { useProjects } from "./ProjectsProvider";
import { useProjectSwimlines } from "./useProjectSwimlines";
import { AddProjectPanel } from "./AddProjectPanel";
import { ExecutiveSummary } from "./ExecutiveSummary";
import { ExplorerPanel, type ExplorerView } from "./ExplorerPanel";
import { ImportPanel } from "./ImportPanel";
import { SettingsPanel, type SidePanelMode } from "./SettingsPanel";
import { Sidebar, type SidebarActive } from "./Sidebar";
import { useAppSettings } from "./useAppSettings";
import { useSidePanel } from "./useSidePanel";
import { useLanguage } from "./i18n/LanguageProvider";
import { MONTH_ABBR } from "@/lib/i18n";
import { formatMonthRange } from "./formatMonthRange";
import { IconPlus } from "@/lib/icons";
import styles from "./page.module.css";

/** The Gantt-button shortcut's own panel — a project's Swimlines view,
 * opened directly from the Program page without navigating into the
 * project. A real component (not inline JSX) because it needs its own
 * useProjectSwimlines() hook instance, and hooks can't be called
 * conditionally from ProgramPage itself (this only mounts at all once a
 * project's Gantt button has actually been clicked). */
function ProjectGanttPanel({
  project,
  stageCategories,
  draftRange,
  onDraftRangeConsumed,
  panelRef,
  onClose,
}: {
  project: Project;
  stageCategories: StageCategoryDef[];
  draftRange?: { laneId: string; start: number; end: number } | null;
  onDraftRangeConsumed?: () => void;
  panelRef: Ref<HTMLDivElement>;
  onClose: () => void;
}) {
  const { program, commentsByActivity, addComment } = useProjects();
  // Opens straight to the project's high-level plan (Design/Build/SIT/
  // UAT/…, see Lane.isProjectPlan) rather than the lanes list — that's
  // what the Gantt button next to a project name on the Program page is
  // for. Falls back to the lanes list for a project that doesn't have a
  // plan lane yet (shouldn't happen for anything created via AddProjectPanel,
  // but older/imported data may not have one).
  const planLane = project.lanes.find((l) => l.isProjectPlan);
  const initialView: ExplorerView = planLane ? { level: "phases", laneId: planLane.id } : { level: "lanes" };
  const {
    explorer,
    setExplorer,
    getActivities,
    addLane,
    renameLane,
    updatePhase,
    addPhase,
    deleteLane,
    deletePhase,
    addActivity,
    deleteActivity,
  } = useProjectSwimlines(project, initialView);

  return (
    <ExplorerPanel
      ref={panelRef}
      lanes={project.lanes}
      startMonth={program.startMonth}
      view={explorer ?? { level: "lanes" }}
      stageCategories={stageCategories}
      getActivities={getActivities}
      onNavigate={setExplorer}
      onClose={onClose}
      onAddLane={addLane}
      onRenameLane={renameLane}
      draftRange={draftRange}
      onDraftRangeConsumed={onDraftRangeConsumed}
      onUpdatePhase={updatePhase}
      onAddPhase={addPhase}
      onAddActivity={addActivity}
      onDeleteLane={deleteLane}
      onDeletePhase={deletePhase}
      onDeleteActivity={deleteActivity}
      commentsByActivity={commentsByActivity}
      onAddComment={addComment}
    />
  );
}

/**
 * Program (portfolio) view — the top of the Program → Project → Phase
 * hierarchy. Renders one Gantt bar per project (PoapRenderer reused as-is:
 * "lane" here means "project", not "team"), with each project's own
 * SIT/UAT/TCO/… summary bars derived automatically from whatever its teams
 * already tagged (see deriveProgramLanes in src/lib/portfolio.ts) — nobody
 * maintains a second, parallel executive-summary calendar by hand.
 * Clicking a project's name drills into its own detail page
 * (src/app/project/[projectId]/page.tsx), which is exactly the single-
 * project experience this app started as. The project list itself comes
 * from ProjectsProvider (not the static mock-data import) so a project
 * created here is still there once you navigate into it.
 */
export default function ProgramPage() {
  const { locale, t } = useLanguage();
  const router = useRouter();
  const settings = useAppSettings();
  const {
    loaded,
    program,
    updateProgram,
    projects,
    addProject,
    deleteProject,
    setProjectNote,
    stageCategories,
    addStageCategory,
    renameStageCategory,
    deleteStageCategory,
  } = useProjects();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importProjectName, setImportProjectName] = useState("");
  const [ganttProjectId, setGanttProjectId] = useState<string | null>(null);
  const [draftRange, setDraftRange] = useState<{ laneId: string; start: number; end: number } | null>(null);

  const lanes = useMemo(() => deriveProgramLanes(projects, stageCategories), [projects, stageCategories]);
  const ganttProject = ganttProjectId ? (projects.find((p) => p.id === ganttProjectId) ?? null) : null;

  const anyPanelOpen = settingsOpen || addProjectOpen || importOpen || Boolean(ganttProject);

  function closeAllPanels() {
    setSettingsOpen(false);
    setAddProjectOpen(false);
    setImportOpen(false);
    setGanttProjectId(null);
    setDraftRange(null);
  }

  const sidePanel = useSidePanel({
    sidePanelMode: settings.sidePanelMode,
    isOpen: anyPanelOpen,
    onCloseAll: closeAllPanels,
  });

  function openSettingsPanel() {
    closeAllPanels();
    setSettingsOpen(true);
    sidePanel.revealFixedPanel();
    sidePanel.scrollToPanel();
  }

  function openAddProjectPanel() {
    closeAllPanels();
    setAddProjectOpen(true);
    sidePanel.revealFixedPanel();
    sidePanel.scrollToPanel();
  }

  function openImportPanel() {
    closeAllPanels();
    setImportProjectName("");
    setImportOpen(true);
    sidePanel.revealFixedPanel();
    sidePanel.scrollToPanel();
  }

  // The Gantt-button shortcut on each project row — opens that project's
  // Swimlines panel right here, without navigating to its own page.
  function openGanttPanel(projectId: string) {
    closeAllPanels();
    setGanttProjectId(projectId);
    sidePanel.revealFixedPanel();
    sidePanel.scrollToPanel();
  }

  // Dragging directly on a project's row in the portfolio calendar —
  // "swimlines de proyectos" get the same track-creation gesture as any
  // other swimline. The bars on this page are a derived summary
  // (deriveProgramLanes), not real rows of their own, so a drag here
  // routes to that project's actual plan-lane phase form instead — same
  // shortcut panel the Gantt button already opens, just pre-filled.
  function handleCreatePhase(projectId: string, start: number, end: number) {
    const project = projects.find((p) => p.id === projectId);
    const planLane = project?.lanes.find((l) => l.isProjectPlan);
    closeAllPanels();
    setGanttProjectId(projectId);
    if (planLane) setDraftRange({ laneId: planLane.id, start, end });
    sidePanel.revealFixedPanel();
    sidePanel.scrollToPanel();
  }

  // "Home" always means "just the calendar", regardless of side-panel mode.
  function goHome() {
    closeAllPanels();
    sidePanel.hideFixedPanel();
  }

  // Switching into "fixed" mode while a panel was already open should
  // dock it visibly right away, not silently drop it.
  function handleSidePanelModeChange(mode: SidePanelMode) {
    settings.setSidePanelMode(mode);
    if (mode === "fixed" && anyPanelOpen) sidePanel.revealFixedPanel();
  }

  function openProject(projectId: string) {
    router.push(`/project/${projectId}`);
  }

  function createProject(input: { name: string; lanes: Parameters<typeof addProject>[0]["lanes"] }) {
    const id = addProject({ name: input.name, lanes: input.lanes, gates: [] });
    closeAllPanels();
    router.push(`/project/${id}`);
  }

  function createProjectFromImport(lanes: Lane[]) {
    const id = addProject({ name: importProjectName.trim(), lanes, gates: [] });
    closeAllPanels();
    router.push(`/project/${id}`);
  }

  const sidebarActive: SidebarActive = settingsOpen ? "settings" : importOpen ? "import" : "home";

  const panelContent = ganttProject ? (
    <ProjectGanttPanel
      key={ganttProject.id}
      project={ganttProject}
      stageCategories={stageCategories}
      draftRange={draftRange}
      onDraftRangeConsumed={() => setDraftRange(null)}
      panelRef={sidePanel.panelRef}
      onClose={sidePanel.closePanel}
    />
  ) : addProjectOpen ? (
    <AddProjectPanel
      ref={sidePanel.panelRef}
      startMonth={program.startMonth}
      stageCategories={stageCategories}
      onClose={sidePanel.closePanel}
      onCreate={createProject}
    />
  ) : importOpen ? (
    <ImportPanel
      ref={sidePanel.panelRef}
      startMonth={program.startMonth}
      months={program.months}
      nameField={{ value: importProjectName, onChange: setImportProjectName, placeholder: t.addProject.namePlaceholder }}
      onClose={sidePanel.closePanel}
      onImport={createProjectFromImport}
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
      program={program}
      onUpdateProgram={updateProgram}
      projects={projects}
      onDeleteProject={deleteProject}
      onClose={sidePanel.closePanel}
    />
  ) : null;

  return (
    <>
      <Sidebar
        position={settings.navPosition}
        active={sidebarActive}
        onHome={goHome}
        onImport={openImportPanel}
        onSettings={openSettingsPanel}
        showPanelToggle={settings.sidePanelMode === "fixed"}
        panelVisible={sidePanel.fixedPanelVisible}
        onTogglePanel={sidePanel.toggleFixedPanel}
      />
      <main className={`${styles.main} ${settings.navPosition === "left" ? styles.mainNavLeft : styles.mainNavRight}`}>
        <div className={styles.headerRow}>
          <div>
            <p className={styles.eyebrow}>{t.header.eyebrow}</p>
            <h1 className={styles.title}>{t.header.programTitle(program.name)}</h1>
            <p className={styles.meta}>
              {projects.length} {t.header.projectsWord} · {program.months} {t.header.monthsWord} ·{" "}
              {formatMonthRange(program.startMonth, program.months, MONTH_ABBR[locale])}
            </p>
          </div>
          <div className={styles.headerActions}>
            <button type="button" className={styles.importButton} onClick={openImportPanel}>
              {t.header.importButton}
            </button>
            <button type="button" className={styles.importButton} onClick={openAddProjectPanel}>
              <IconPlus /> {t.header.addProjectButton}
            </button>
          </div>
        </div>

        <ExecutiveSummary projects={projects} onSetNote={setProjectNote} />

        <div className={`${styles.layout} ${settings.sidePanelMode === "fixed" ? styles.layoutStacked : ""}`}>
          <div className={styles.calendarCol}>
            {!loaded ? (
              <p className={styles.meta}>{t.header.loading}</p>
            ) : projects.length === 0 ? (
              <div className={styles.emptyProgram}>
                <p className={styles.emptyProgramTitle}>{t.header.emptyProgramTitle}</p>
                <p className={styles.emptyProgramBody}>{t.header.emptyProgramBody}</p>
                <div className={styles.emptyProgramActions}>
                  <button type="button" className={styles.importButton} onClick={openAddProjectPanel}>
                    <IconPlus /> {t.header.addProjectButton}
                  </button>
                  <button type="button" className={styles.importButton} onClick={openImportPanel}>
                    {t.header.importButton}
                  </button>
                </div>
              </div>
            ) : (
              <PoapRenderer
                months={program.months}
                startMonth={program.startMonth}
                lanes={lanes}
                onLaneClick={openProject}
                onLaneGanttClick={openGanttPanel}
                onCreatePhase={handleCreatePhase}
                locale={locale}
                showWeekends={settings.showWeekends}
                showToday={settings.showToday}
              />
            )}
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
            calendar instead of squeezing it. Only rendered while a panel
            is actually open, and closes on an outside click. */}
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

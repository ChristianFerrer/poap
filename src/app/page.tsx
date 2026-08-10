"use client";

import { useMemo, useState, type Ref } from "react";
import { useRouter } from "next/navigation";
import { PoapRenderer } from "@/components/poap-renderer/PoapRenderer";
import { deriveProgramLanes, findUnassignedPlanIssues, type Project, type StageCategoryDef } from "@/lib/portfolio";
import { useProjects } from "./ProjectsProvider";
import { useProjectSwimlines } from "./useProjectSwimlines";
import { ExecutiveSummary } from "./ExecutiveSummary";
import { ExplorerPanel, type ExplorerView } from "./ExplorerPanel";
import { ImportPanel, importedLanesToLanes } from "./ImportPanel";
import type { ParseResult } from "@/lib/importExcel";
import { SettingsPanel } from "./SettingsPanel";
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
  const { program, plansByLane, commentsByActivity, addComment, renameProject } = useProjects();
  const router = useRouter();
  // Opens straight to the project's high-level plan (Design/Build/SIT/
  // UAT/…, see Lane.isProjectPlan) rather than the lanes list — that's
  // what the Gantt button next to a project name on the Program page is
  // for. Falls back to the lanes list for a project that doesn't have a
  // plan lane yet (shouldn't happen for anything created via the canvas's
  // own "+" button, but older/imported data may not have one).
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
      projectName={project.name}
      onRenameProject={(name) => renameProject(project.id, name)}
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
      planIssues={findUnassignedPlanIssues(project.lanes, plansByLane)}
      onFixPlanIssue={() => router.push(`/project/${project.id}`)}
      planOptions={[]}
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
    addProjects,
    addProjectBelow,
    deleteProject,
    reorderProjects,
    stageCategories,
    addStageCategory,
    renameStageCategory,
    deleteStageCategory,
  } = useProjects();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [ganttProjectId, setGanttProjectId] = useState<string | null>(null);
  const [draftRange, setDraftRange] = useState<{ laneId: string; start: number; end: number } | null>(null);

  const lanes = useMemo(() => deriveProgramLanes(projects, stageCategories), [projects, stageCategories]);
  const ganttProject = ganttProjectId ? (projects.find((p) => p.id === ganttProjectId) ?? null) : null;

  const anyPanelOpen = settingsOpen || importOpen || Boolean(ganttProject);

  function closeAllPanels() {
    setSettingsOpen(false);
    setImportOpen(false);
    setGanttProjectId(null);
    setDraftRange(null);
  }

  const sidePanel = useSidePanel({
    isOpen: anyPanelOpen,
    onCloseAll: closeAllPanels,
  });

  function openSettingsPanel() {
    closeAllPanels();
    setSettingsOpen(true);
    sidePanel.scrollToPanel();
  }

  // Only reachable from the empty-program state now — every other "add a
  // project" affordance is the canvas's own "+" (see PoapRenderer's
  // onAddLaneBelow, wired below as addProjectBelow), but a program with no
  // projects yet has no row to click "+" on, so this is the one seed.
  function createFirstProject() {
    addProject({ name: t.addProject.defaultProjectName, lanes: [], gates: [] });
  }

  function openImportPanel() {
    closeAllPanels();
    setImportOpen(true);
    sidePanel.scrollToPanel();
  }

  // The Gantt-button shortcut on each project row — opens that project's
  // Swimlines panel right here, without navigating to its own page.
  function openGanttPanel(projectId: string) {
    closeAllPanels();
    setGanttProjectId(projectId);
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
    sidePanel.scrollToPanel();
  }

  function goHome() {
    closeAllPanels();
  }

  function openProject(projectId: string) {
    router.push(`/project/${projectId}`);
  }

  // A Program-page import is understood to be a whole portfolio, not one
  // project's own breakdown — every top-level lane the sheet parsed out
  // (e.g. one per business unit or option) becomes its own new project,
  // named straight from that lane's own name, with its phases as that
  // project's plan lane. No project-name field needed: there's no single
  // name to ask for. Stays on the Program page afterward (not navigating
  // into any one of the several projects just created) so every new row
  // is visible at once, same as the project-page import staying put to
  // show its own "imported" confirmation.
  function createProjectsFromImport(result: ParseResult) {
    const lanes = importedLanesToLanes(result, program.startMonth);
    addProjects(lanes.map((lane) => ({ name: lane.name, lanes: [{ ...lane, isProjectPlan: true }], gates: [] })));
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
  ) : importOpen ? (
    <ImportPanel
      ref={sidePanel.panelRef}
      startMonth={program.startMonth}
      months={program.months}
      mode="projects"
      onClose={sidePanel.closePanel}
      onImport={createProjectsFromImport}
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
        active={sidebarActive}
        onHome={goHome}
        onImport={openImportPanel}
        onSettings={openSettingsPanel}
        collapsed={settings.sidebarCollapsed}
        onToggleCollapsed={() => settings.setSidebarCollapsed(!settings.sidebarCollapsed)}
      />
      <main className={`${styles.main} ${settings.sidebarCollapsed ? styles.mainNavLeftCollapsed : styles.mainNavLeft}`}>
        <div className={styles.headerRow}>
          <div>
            <p className={styles.eyebrow}>{t.header.levelProgram}</p>
            <h1 className={styles.title}>{program.name}</h1>
            <p className={styles.meta}>
              {projects.length} {t.header.projectsWord} · {program.months} {t.header.monthsWord} ·{" "}
              {formatMonthRange(program.startMonth, program.months, MONTH_ABBR[locale])}
            </p>
          </div>
        </div>

        <ExecutiveSummary projects={projects} />

        <div className={styles.layout}>
          <div className={styles.calendarCol}>
            {!loaded ? (
              <p className={styles.meta}>{t.header.loading}</p>
            ) : projects.length === 0 ? (
              <div className={styles.emptyProgram}>
                <p className={styles.emptyProgramTitle}>{t.header.emptyProgramTitle}</p>
                <p className={styles.emptyProgramBody}>{t.header.emptyProgramBody}</p>
                <div className={styles.emptyProgramActions}>
                  <button type="button" className={styles.importButton} onClick={createFirstProject}>
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
                // Every project row is a "regular" swimline here (the
                // Program page has no isProjectPlan anchor concept) — see
                // CLAUDE.md's consistency principle: the same delete/
                // reorder/add-below tooling the Project page's canvas gets
                // must be wired here too, not just there.
                onDeleteLane={deleteProject}
                onAddLaneBelow={addProjectBelow}
                onReorderLanes={reorderProjects}
                locale={locale}
                showWeekends={settings.showWeekends}
                showToday={settings.showToday}
              />
            )}
          </div>
        </div>

        {/* Floating overlay, right-anchored, not part of the flex layout
            above, so it floats over the calendar instead of squeezing it.
            Only rendered while a panel is actually open, and closes on an
            outside click. */}
        {anyPanelOpen && (
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

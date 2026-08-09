"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PoapRenderer } from "@/components/poap-renderer/PoapRenderer";
import { groupPhasesByPlan } from "@/lib/portfolio";
import { useProjects } from "@/app/ProjectsProvider";
import { SettingsPanel } from "@/app/SettingsPanel";
import { Sidebar } from "@/app/Sidebar";
import { useAppSettings } from "@/app/useAppSettings";
import { useSidePanel } from "@/app/useSidePanel";
import { useLanguage } from "@/app/i18n/LanguageProvider";
import { MONTH_ABBR } from "@/lib/i18n";
import { formatMonthRange } from "@/app/formatMonthRange";
import { IconChevronRight, IconPlus, IconTrash } from "@/lib/icons";
import styles from "@/app/page.module.css";
import explorerStyles from "@/app/ExplorerPanel.module.css";

/**
 * Equipo -> Planes: one swimline per Plan, its own real phases packed
 * inside exactly like any other lane (see groupPhasesByPlan) — the same
 * "reinterpret Lane as one level down" trick the Program page already uses
 * for Proyecto-as-lane, applied one level further. Clicking a Plan's name
 * drills into its own Fases view (.../plan/[planId]); the isProjectPlan
 * anchor lane never lands here — it keeps its existing side-panel editing.
 */
export default function LanePage({ params }: { params: { projectId: string; laneId: string } }) {
  const {
    loaded,
    program,
    updateProgram,
    projects,
    deleteProject,
    plansByLane,
    addPlan,
    renamePlan,
    deletePlan,
    stageCategories,
    addStageCategory,
    renameStageCategory,
    deleteStageCategory,
  } = useProjects();
  const { locale, t } = useLanguage();
  const router = useRouter();
  const settings = useAppSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newPlanName, setNewPlanName] = useState("");

  const sidePanel = useSidePanel({
    sidePanelMode: settings.sidePanelMode,
    isOpen: settingsOpen,
    onCloseAll: () => setSettingsOpen(false),
  });

  if (!loaded) {
    return (
      <main className={styles.main}>
        <p className={styles.meta}>{t.header.loading}</p>
      </main>
    );
  }

  const project = projects.find((p) => p.id === params.projectId);
  const lane = project?.lanes.find((l) => l.id === params.laneId);

  if (!project || !lane) {
    return (
      <main className={styles.main}>
        <p className={styles.eyebrow}>{t.header.eyebrow}</p>
        <h1 className={styles.title}>{params.laneId}</h1>
        <Link href={project ? `/project/${project.id}` : "/"} className={styles.meta}>
          {project ? t.plansNav.backToProject(project.name) : t.header.backToProgram}
        </Link>
      </main>
    );
  }

  const plans = plansByLane[lane.id] ?? [];
  const planLanes = groupPhasesByPlan(lane, plans, t.plansNav.unassignedPlanLabel);

  function openSettingsPanel() {
    setSettingsOpen(true);
    sidePanel.revealFixedPanel();
    sidePanel.scrollToPanel();
  }

  function goHome() {
    router.push(`/project/${project!.id}`);
  }

  function openPlan(planId: string) {
    if (planId === "__unassigned__") return;
    router.push(`/project/${project!.id}/lane/${lane!.id}/plan/${planId}`);
  }

  function submitNewPlan() {
    if (!newPlanName.trim()) return;
    addPlan(lane!.id, newPlanName.trim());
    setNewPlanName("");
  }

  const panelContent = settingsOpen ? (
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

  return (
    <>
      <Sidebar
        position={settings.navPosition}
        active={settingsOpen ? "settings" : "home"}
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
            <Link href={`/project/${project.id}`} className={styles.eyebrow}>
              {t.plansNav.backToProject(project.name)}
            </Link>
            <h1 className={styles.title}>{t.plansNav.plansTitle(lane.name)}</h1>
            <p className={styles.meta}>
              {plans.length} {plans.length === 1 ? "plan" : "planes"} · {formatMonthRange(program.startMonth, program.months, MONTH_ABBR[locale])}
            </p>
          </div>
        </div>

        <div className={explorerStyles.addGroup} style={{ margin: "0 0 16px" }}>
          <p className={explorerStyles.sectionTitle}>{t.plansNav.addPlanSection}</p>
          <div className={explorerStyles.addRow}>
            <input
              className={explorerStyles.textInput}
              placeholder={t.plansNav.planNamePlaceholder}
              value={newPlanName}
              onChange={(e) => setNewPlanName(e.target.value)}
            />
            <button type="button" className={explorerStyles.addButton} disabled={!newPlanName.trim()} onClick={submitNewPlan}>
              <IconPlus /> {t.explorer.addButton}
            </button>
          </div>
        </div>

        {planLanes.length === 0 ? (
          <p className={styles.meta}>{t.plansNav.noPlans}</p>
        ) : (
          <div className={styles.layout}>
            <div className={styles.calendarCol}>
              <PoapRenderer
                months={program.months}
                startMonth={program.startMonth}
                lanes={planLanes}
                onLaneClick={openPlan}
                locale={locale}
                showWeekends={settings.showWeekends}
                showToday={settings.showToday}
              />
            </div>
          </div>
        )}

        {plans.length > 0 && (
          <div className={explorerStyles.listGroup} style={{ marginTop: 20 }}>
            <p className={explorerStyles.sectionTitle}>{t.plansNav.plansEyebrow} {lane.name}</p>
            {plans.map((plan) => (
              <div key={plan.id} className={explorerStyles.addRow}>
                <input
                  className={explorerStyles.tableTextInput}
                  value={plan.name}
                  onChange={(e) => renamePlan(plan.id, e.target.value)}
                  aria-label={t.plansNav.renamePlanAria}
                />
                <button
                  type="button"
                  className={explorerStyles.viewButton}
                  onClick={() => openPlan(plan.id)}
                  aria-label={t.explorer.viewGanttAria(plan.name)}
                  title={t.explorer.viewGanttAria(plan.name)}
                >
                  <IconChevronRight />
                </button>
                <button
                  type="button"
                  className={explorerStyles.deleteButton}
                  onClick={() => deletePlan(plan.id)}
                  aria-label={t.plansNav.deletePlanAria(plan.name)}
                >
                  <IconTrash />
                </button>
              </div>
            ))}
          </div>
        )}

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

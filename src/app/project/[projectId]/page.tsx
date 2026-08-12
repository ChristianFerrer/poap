"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PoapRenderer } from "@/components/poap-renderer/PoapRenderer";
import type { Gate, Lane, Phase } from "@/components/poap-renderer/types";
import {
  derivePlanAggregateBars,
  findUnassignedPlanIssues,
  groupPhasesByPlan,
  UNASSIGNED_PLAN_ID,
  type Plan,
  type Project,
} from "@/lib/portfolio";
import type { ActivitySeed } from "../../mock-data";
import { BANDS } from "../../mock-data";
import { useProjects } from "../../ProjectsProvider";
import { useProjectSwimlines } from "../../useProjectSwimlines";
import { ExplorerPanel, type ExplorerView } from "../../ExplorerPanel";
import { ImportPanel, importedLanesToLanes } from "../../ImportPanel";
import type { ParseResult } from "@/lib/importExcel";
import { NotificationBell, type NotificationAlert } from "../../NotificationBell";
import { SettingsPanel } from "../../SettingsPanel";
import { Sidebar, type SidebarActive } from "../../Sidebar";
import { useAppSettings } from "../../useAppSettings";
import { useSidePanel } from "../../useSidePanel";
import { useLanguage } from "../../i18n/LanguageProvider";
import { MONTH_ABBR } from "@/lib/i18n";
import { formatMonthRange } from "../../formatMonthRange";
import { IconPlus } from "@/lib/icons";
import styles from "../../page.module.css";
import explorerStyles from "../../ExplorerPanel.module.css";

/** Where the recursive swimline canvas currently is — null means "top of
 * the project" (Equipos, exactly as before). Each step down mirrors the
 * mockup mechanic verbatim: click a swimline's name, the next screen pins
 * it as the anchor on top and shows *its* children as swimlines below,
 * repeated at every level (Equipo -> Plan -> Fase -> Actividad). Kept as
 * page-local client state, not a route — there is exactly one mechanism,
 * reused, not a page per level. */
type Drill =
  | { level: "equipo"; laneId: string }
  | { level: "plan"; laneId: string; planId: string }
  | { level: "fase"; laneId: string; planId: string; phaseId: string };

function activitiesAsBars(activities: ActivitySeed[]): Phase[] {
  return activities.map((a) => ({ id: a.id, title: a.title, start: a.start, end: a.end, status: a.status }));
}

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
        <p className={`${styles.eyebrow} ${styles.eyebrowDecorative}`}>{t.header.eyebrow}</p>
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
    program,
    updateProgram,
    renameProject,
    setProjectLanes,
    plansByLane,
    addPlan,
    addPlans,
    addPlanBelow,
    renamePlan,
    deletePlan,
    reorderPlans,
    commentsByActivity,
    addComment,
    announceUndo,
  } = useProjects();
  const {
    explorer,
    setExplorer,
    getActivities,
    addLane,
    addLaneBelow,
    renameLane,
    reorderLanes,
    updatePhase,
    addPhase,
    deleteLane,
    deletePhase,
    addActivity,
    deleteActivity,
  } = useProjectSwimlines(project);

  const lanes = project.lanes;
  const [activeGateIds, setActiveGateIds] = useState<string[]>([]);
  const [drill, setDrill] = useState<Drill | null>(null);
  const [newPlanName, setNewPlanName] = useState("");

  const [importOpen, setImportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const phaseCount = lanes.reduce((n, l) => n + l.phases.length, 0);

  // Same two issue sources the old Sidebar corner badge used to tally,
  // expanded into the notification bell's own popup list — each alert
  // keeps the deep-link
  // navigation the old in-panel LinkageBanner used (straight to the
  // offending lane's phases, or into the Equipo's "Sin plan asignado"
  // bucket) rather than just opening the lanes list generically.
  const notificationAlerts: NotificationAlert[] = useMemo(() => {
    const alerts: NotificationAlert[] = [];
    for (const issue of findUnassignedPlanIssues(lanes, plansByLane)) {
      alerts.push({
        id: `plan-${issue.phaseId}`,
        message: t.linkage.planMessage(issue.laneName, issue.phaseTitle),
        actionLabel: t.linkage.planFixButton,
        onAction: () => handleFixPlanIssue(issue.laneId),
      });
    }
    return alerts;
  }, [lanes, plansByLane, t]);

  function closeAllPanels() {
    setExplorer(null);
    setImportOpen(false);
    setSettingsOpen(false);
  }

  const anyPanelOpen = Boolean(explorer || importOpen || settingsOpen);
  const sidePanel = useSidePanel({
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
    setImportOpen(false);
    setSettingsOpen(false);
    sidePanel.scrollToPanel();
  }

  // Same panel-opening call the Gantt button always used, except a second
  // click on the row that's already open closes it instead of re-opening
  // the same view — matches the button's own active/pressed look (see
  // activeGanttLaneId below), which would otherwise claim to be a toggle
  // without behaving like one.
  function openOrCloseExplorer(view: ExplorerView) {
    const alreadyOpen =
      (view.level === "phases" && explorer?.level === "phases" && explorer.laneId === view.laneId) ||
      (view.level === "activities" && explorer?.level === "activities" && explorer.phaseId === view.phaseId);
    if (alreadyOpen) {
      sidePanel.closePanel();
      return;
    }
    openExplorer(view);
  }

  function openImportPanel() {
    setImportOpen(true);
    setExplorer(null);
    setSettingsOpen(false);
    sidePanel.scrollToPanel();
  }

  function openSettingsPanel() {
    setSettingsOpen(true);
    setExplorer(null);
    setImportOpen(false);
    sidePanel.scrollToPanel();
  }

  function submitNewPlan() {
    if (!drill || drill.level !== "equipo" || !newPlanName.trim()) return;
    addPlan(drill.laneId, newPlanName.trim());
    setNewPlanName("");
  }

  // A hand-created track always already has a Plan by the time it exists
  // (see isLaneCreatable) — import used to skip that requirement entirely,
  // leaving every imported phase landing in the "Sin plan asignado" bucket
  // the moment someone drilled into its team lane. Minting one default
  // Plan per imported lane up front, before the phases exist, keeps
  // imported work organized the same way hand-created work always is.
  function importLanes(result: ParseResult) {
    const newLanes = importedLanesToLanes(result, program.startMonth).map((lane) => {
      const planId = crypto.randomUUID();
      return { lane: { ...lane, phases: lane.phases.map((p) => ({ ...p, planId })) }, planId };
    });
    setProjectLanes(project.id, (prev) => [
      ...prev,
      ...newLanes.map(({ lane }, i) => ({ ...lane, sortOrder: prev.length + i })),
    ]);
    addPlans(
      newLanes.map(
        ({ lane, planId }): Plan => ({ id: planId, laneId: lane.id, name: t.import.defaultImportedPlanName, sortOrder: 0 }),
      ),
    );
  }

  // Fixing a Plan-linkage issue (a Fase with no real Plan) means landing
  // right where it can be resolved: drilled into its Equipo, looking at the
  // "Sin plan asignado" bucket, where each orphaned phase gets its own Plan
  // picker (see planOptions/ExplorerPanel's Plan column below).
  function handleFixPlanIssue(laneId: string) {
    setDrill({ level: "equipo", laneId });
    openExplorer({ level: "phases", laneId: UNASSIGNED_PLAN_ID });
  }

  // Only meaningful while looking at the "Sin plan asignado" bucket's
  // phases (laneId === UNASSIGNED_PLAN_ID) under a drilled-in Equipo — the
  // one place ExplorerPanel needs a target list of real Plans to reassign
  // an orphaned phase into.
  const planOptions =
    drill?.level === "equipo" && explorer?.level === "phases" && explorer.laneId === UNASSIGNED_PLAN_ID
      ? (plansByLane[drill.laneId] ?? [])
      : [];

  // ---------------------------------------------------------------------
  // The recursive canvas: what PoapRenderer actually renders right now,
  // derived fresh from `drill` on every render rather than stored — a
  // Plan/Fase edited elsewhere shows up the instant you're looking at it,
  // same "never go stale" rule as the linkage alerts.
  // ---------------------------------------------------------------------

  function equipoName(laneId: string): string {
    return lanes.find((l) => l.id === laneId)?.name ?? "";
  }
  function planName(laneId: string, planId: string): string {
    if (planId === UNASSIGNED_PLAN_ID) return t.plansNav.unassignedPlanLabel;
    return (plansByLane[laneId] ?? []).find((p) => p.id === planId)?.name ?? "";
  }
  function faseName(laneId: string, phaseId: string): string {
    return lanes.find((l) => l.id === laneId)?.phases.find((p) => p.id === phaseId)?.title ?? "";
  }

  const canvasLanes: Lane[] = (() => {
    if (!drill) {
      // Every lane — the anchor and every team lane alike — shows its own
      // real, ungrouped phases at the project's top level; Plans only
      // organize a team's phases one level deeper (see the "equipo" case
      // below), they never collapse what's shown up here.
      return lanes;
    }
    if (drill.level === "equipo") {
      const lane = lanes.find((l) => l.id === drill.laneId);
      if (!lane) return [];
      const plans = plansByLane[drill.laneId] ?? [];
      const anchor: Lane = { ...lane, isProjectPlan: true, phases: derivePlanAggregateBars(lane, plans) };
      const children = groupPhasesByPlan(lane, plans, t.plansNav.unassignedPlanLabel);
      return [anchor, ...children];
    }
    if (drill.level === "plan") {
      const lane = lanes.find((l) => l.id === drill.laneId);
      if (!lane) return [];
      const plans = plansByLane[drill.laneId] ?? [];
      const isUnassigned = drill.planId === UNASSIGNED_PLAN_ID;
      const planPhases = lane.phases.filter((p) =>
        isUnassigned ? !p.planId || !plans.some((pl) => pl.id === p.planId) : p.planId === drill.planId,
      );
      const anchor: Lane = {
        id: drill.planId,
        name: planName(drill.laneId, drill.planId),
        sortOrder: 0,
        isProjectPlan: true,
        phases: planPhases,
      };
      const children: Lane[] = planPhases.map((phase) => ({
        id: phase.id,
        name: phase.title,
        sortOrder: 0,
        phases: activitiesAsBars(getActivities(phase)),
      }));
      return [anchor, ...children];
    }
    // drill.level === "fase" — Actividad is the true leaf, no children below it
    const lane = lanes.find((l) => l.id === drill.laneId);
    const phase = lane?.phases.find((p) => p.id === drill.phaseId);
    if (!phase) return [];
    const anchor: Lane = {
      id: phase.id,
      name: phase.title,
      sortOrder: 0,
      isProjectPlan: true,
      phases: activitiesAsBars(getActivities(phase)),
    };
    return [anchor];
  })();

  // `lanes` ExplorerPanel actually edits against — real project lanes for
  // the top level, or (while drilled in) that Equipo's Planes-as-lanes
  // synthetic view. See handleAddPhase/handleUpdatePhase/handleDeletePhase
  // for how a mutation on one of these synthetic ids gets redirected back
  // to the real lane it belongs to.
  const explorerLanes: Lane[] = (() => {
    if (drill?.level === "equipo") {
      const lane = lanes.find((l) => l.id === drill.laneId);
      if (!lane) return lanes;
      const plans = plansByLane[drill.laneId] ?? [];
      return [...groupPhasesByPlan(lane, plans, t.plansNav.unassignedPlanLabel), ...lanes];
    }
    if (drill?.level === "plan") {
      const lane = lanes.find((l) => l.id === drill.laneId);
      if (!lane) return lanes;
      const plans = plansByLane[drill.laneId] ?? [];
      const isUnassigned = drill.planId === UNASSIGNED_PLAN_ID;
      const planPhases = lane.phases.filter((p) =>
        isUnassigned ? !p.planId || !plans.some((pl) => pl.id === p.planId) : p.planId === drill.planId,
      );
      return [{ id: drill.planId, name: planName(drill.laneId, drill.planId), sortOrder: 0, phases: planPhases }, ...lanes];
    }
    return lanes;
  })();

  function handlePhaseClick(barId: string) {
    if (!drill) {
      // A team lane's bar here is a Plan aggregate (id = a real Plan's id);
      // the anchor's own bars are the isProjectPlan lane's real phases.
      const owningLaneId = Object.keys(plansByLane).find((laneId) => plansByLane[laneId]!.some((p) => p.id === barId));
      if (owningLaneId) {
        setDrill({ level: "plan", laneId: owningLaneId, planId: barId });
        return;
      }
      openExplorer({ level: "activities", phaseId: barId });
      return;
    }
    if (drill.level === "equipo") {
      const plans = plansByLane[drill.laneId] ?? [];
      if (plans.some((p) => p.id === barId)) {
        setDrill({ level: "plan", laneId: drill.laneId, planId: barId });
        return;
      }
      openExplorer({ level: "activities", phaseId: barId });
      return;
    }
    if (drill.level === "plan") {
      const lane = lanes.find((l) => l.id === drill.laneId);
      if (lane?.phases.some((p) => p.id === barId)) {
        setDrill({ level: "fase", laneId: drill.laneId, planId: drill.planId, phaseId: barId });
        return;
      }
      const owningPhase = lane?.phases.find((p) => getActivities(p).some((a) => a.id === barId));
      if (owningPhase) openExplorer({ level: "activity", phaseId: owningPhase.id, activityId: barId });
      return;
    }
    // drill.level === "fase" — every bar here is one of this Fase's own activities
    openExplorer({ level: "activity", phaseId: drill.phaseId, activityId: barId });
  }

  // One rule, applied the same way at every depth: clicking a row's name
  // navigates to whatever real swimlines live *beneath* it (a team lane's
  // Planes, a Plan's Fases) — and a row with nothing beneath it opens its
  // own management panel directly instead, since there's no lower level
  // for the canvas to drill into. The isProjectPlan anchor lane at the top
  // is the one row that's *always* in that second case: it has no Planes
  // of its own, only its own phases (already the bars drawn on its own
  // track) — same reason a Fase's name has nothing to drill into either
  // (see handlePhaseClick, where a Fase-level bar always opens a panel).
  // This isn't a special case for the anchor specifically, just this one
  // general rule evaluated for a row that happens to have no children.
  function handleLaneClick(laneId: string) {
    if (!drill) {
      const lane = lanes.find((l) => l.id === laneId);
      const hasChildLanes = !lane?.isProjectPlan;
      if (!hasChildLanes) {
        openExplorer({ level: "phases", laneId });
        return;
      }
      setDrill({ level: "equipo", laneId });
      return;
    }
    if (drill.level === "equipo") {
      if (laneId === drill.laneId) return;
      setDrill({ level: "plan", laneId: drill.laneId, planId: laneId });
      return;
    }
    if (drill.level === "plan") {
      if (laneId === drill.planId) return;
      setDrill({ level: "fase", laneId: drill.laneId, planId: drill.planId, phaseId: laneId });
    }
  }

  // Only ever a real, unambiguous parent may receive a dragged track:
  // the isProjectPlan lane at the top, a real Plan once you've drilled
  // into its Equipo, or the Plan itself once it's the anchor — never the
  // "Sin plan asignado" bucket, which would just manufacture more orphans.
  function isLaneCreatable(laneId: string): boolean {
    if (!drill) return lanes.find((l) => l.id === laneId)?.isProjectPlan ?? false;
    if (drill.level === "equipo") return laneId !== UNASSIGNED_PLAN_ID && laneId !== drill.laneId;
    if (drill.level === "plan") return laneId === drill.planId && drill.planId !== UNASSIGNED_PLAN_ID;
    return false;
  }

  // Canvas-wide delete/reorder/add-below dispatch — per CLAUDE.md's "same
  // capability, every screen" rule, every drill level that has real
  // non-anchor lane rows gets these, routed to whatever record that
  // level's synthetic laneId actually stands for:
  //  - top (!drill): real team Lanes
  //  - equipo: real Plans (plus the synthetic "Sin plan asignado" bucket,
  //    excluded via isLaneManageable — it isn't a Plan, so deleting or
  //    reordering it wouldn't mean anything)
  //  - plan: real Fases get delete only — a Phase has no sortOrder of its
  //    own (position comes purely from start/end, see canvasLanes) and
  //    needs real dates to exist at creation, so reorder/add-below have
  //    no meaningful target; ExplorerPanel's own add-phase form (which
  //    requires dates) is the only way to create one
  //  - fase: no non-anchor rows exist at all (an Actividad is a bar on the
  //    anchor's own track, not a lane), so nothing to wire
  const canvasOnDeleteLane = !drill
    ? deleteLane
    : drill.level === "equipo"
      ? (laneId: string) => {
          if (laneId !== UNASSIGNED_PLAN_ID) deletePlan(laneId);
        }
      : drill.level === "plan"
        ? (laneId: string) => deletePhase(drill.laneId, laneId)
        : undefined;
  const canvasOnAddLaneBelow = !drill
    ? addLaneBelow
    : drill.level === "equipo"
      ? (afterLaneId: string) => addPlanBelow(drill.laneId, afterLaneId)
      : undefined;
  const canvasOnReorderLanes = !drill
    ? reorderLanes
    : drill.level === "equipo"
      ? (orderedLaneIds: string[]) => reorderPlans(drill.laneId, orderedLaneIds.filter((id) => id !== UNASSIGNED_PLAN_ID))
      : undefined;
  const canvasIsLaneManageable = drill?.level === "equipo" ? (laneId: string) => laneId !== UNASSIGNED_PLAN_ID : undefined;

  // Dragging directly on a creatable lane's own track — creates the phase
  // immediately with a default title (see handleAddPhase for how a
  // synthetic Plan-as-lane id gets redirected to the real team lane) and
  // hands its id back so PoapRenderer can drop straight into inline
  // editing on the new bar, instead of opening the panel.
  function handleCreatePhase(laneId: string, start: number, end: number): string | undefined {
    if (!isLaneCreatable(laneId)) return undefined;
    const id = crypto.randomUUID();
    handleAddPhase(laneId, { id, title: t.explorer.newPhaseName, start, end, status: "not_started" });
    return id;
  }

  // Commits the name typed into a just-created track's own inline editor
  // (see handleCreatePhase/PoapRenderer's onRenamePhase).
  function handleRenamePhase(laneId: string, phaseId: string, title: string) {
    handleUpdatePhase(laneId, phaseId, { title });
  }

  // The small Gantt-icon next to a row's name (same affordance the Program
  // page already uses for its own project rows) — the one way into
  // add/edit for whatever that row actually is: a Plan's Fases, or a
  // Fase's own Actividades. Not gated by isLaneCreatable — that rule is
  // specifically about a *track needing a Plan*, unrelated to viewing or
  // adding activities under an existing Fase.
  function handleLaneGanttClick(laneId: string) {
    if (!drill) {
      // Top level: laneId is a real team lane (or the isProjectPlan lane)
      // — opens the same rename+edit-tracks panel a Plan/Equipo-anchor row
      // gets once drilled in, without requiring a drill first.
      openOrCloseExplorer({ level: "phases", laneId });
      return;
    }
    if (drill.level === "equipo") {
      // laneId is either this Equipo's own real lane (the anchor row) or
      // one of its real Plans (or UNASSIGNED_PLAN_ID) — either way it's a
      // real "phases" panel target, see explorerLanes for why both resolve.
      openOrCloseExplorer({ level: "phases", laneId });
      return;
    }
    if (drill.level === "plan") {
      if (laneId === drill.planId) {
        if (drill.planId === UNASSIGNED_PLAN_ID) return;
        openOrCloseExplorer({ level: "phases", laneId: drill.planId });
        return;
      }
      openOrCloseExplorer({ level: "activities", phaseId: laneId }); // laneId = a Fase's id
      return;
    }
    if (drill.level === "fase" && laneId === drill.phaseId) {
      openOrCloseExplorer({ level: "activities", phaseId: drill.phaseId });
    }
  }

  // Every phase mutation ExplorerPanel fires targets whatever synthetic
  // laneId it was given (a Plan's own id while drilled in) — these
  // wrappers redirect it at the *real* team lane instead, tagging planId
  // as needed, since that's the only lane actually persisted.
  function handleAddPhase(laneId: string, phase: Phase) {
    // The "Sin plan asignado" bucket is a read/fix surface for existing
    // orphans, never a place to manufacture new ones — same hard rule as
    // isLaneCreatable, just enforced here for the panel's own add-form.
    if (laneId === UNASSIGNED_PLAN_ID) return;
    if (drill?.level === "equipo") {
      addPhase(drill.laneId, { ...phase, planId: laneId });
      return;
    }
    if (drill?.level === "plan") {
      addPhase(drill.laneId, { ...phase, planId: drill.planId === UNASSIGNED_PLAN_ID ? undefined : drill.planId });
      return;
    }
    addPhase(laneId, phase);
  }
  function handleUpdatePhase(laneId: string, phaseId: string, patch: Partial<Pick<Phase, "title" | "start" | "end" | "status" | "planId">>) {
    updatePhase(drill ? drill.laneId : laneId, phaseId, patch);
  }
  function handleDeletePhase(laneId: string, phaseId: string) {
    deletePhase(drill ? drill.laneId : laneId, phaseId);
  }

  // Same "redirect the synthetic id" idea as the phase wrappers above, but
  // for renaming whatever the "phases" panel's own name field is currently
  // showing — a real team lane at the top level or the Equipo anchor, a
  // Plan everywhere else. The "Sin plan asignado" bucket never reaches
  // this (see ExplorerPanel, which keeps it a plain heading).
  function handleRenameLane(laneId: string, name: string) {
    if (!drill) {
      renameLane(laneId, name);
      return;
    }
    if (drill.level === "equipo") {
      if (laneId === drill.laneId) {
        renameLane(laneId, name);
        return;
      }
      if (laneId === UNASSIGNED_PLAN_ID) return;
      renamePlan(laneId, name);
      return;
    }
    if (drill.level === "plan" && laneId === drill.planId && drill.planId !== UNASSIGNED_PLAN_ID) {
      renamePlan(laneId, name);
    }
  }

  function toggleGateActive(gateId: string) {
    setActiveGateIds((prev) => (prev.includes(gateId) ? prev.filter((id) => id !== gateId) : [...prev, gateId]));
  }

  function findGateLaneId(gateId: string): string | undefined {
    return lanes.find((l) => (l.gates ?? []).some((g) => g.id === gateId))?.id;
  }

  // Clicking a gate's own diamond on the canvas — toggles its cut-line and
  // jumps straight to its owning lane's own phases view (where the new
  // Stage Gates section lives), same "click opens the panel below" pattern
  // handleLaneClick already uses for a lane's name.
  function handleGateClick(gateId: string) {
    toggleGateActive(gateId);
    const laneId = findGateLaneId(gateId);
    if (laneId) openExplorer({ level: "phases", laneId });
  }

  function addGate(laneId: string, gate: Gate) {
    setProjectLanes(project.id, (prev) => prev.map((l) => (l.id === laneId ? { ...l, gates: [...(l.gates ?? []), gate] } : l)));
  }

  function updateGate(laneId: string, gateId: string, patch: Partial<Pick<Gate, "label" | "position">>) {
    setProjectLanes(project.id, (prev) =>
      prev.map((l) => (l.id === laneId ? { ...l, gates: (l.gates ?? []).map((g) => (g.id === gateId ? { ...g, ...patch } : g)) } : l)),
    );
  }

  function deleteGate(laneId: string, gateId: string) {
    const lane = lanes.find((l) => l.id === laneId);
    const index = lane?.gates?.findIndex((g) => g.id === gateId) ?? -1;
    if (!lane || index === -1) return;
    const removed = lane.gates![index]!;
    setProjectLanes(project.id, (prev) =>
      prev.map((l) => (l.id === laneId ? { ...l, gates: (l.gates ?? []).filter((g) => g.id !== gateId) } : l)),
    );
    setActiveGateIds((prev) => prev.filter((gid) => gid !== gateId));
    announceUndo(t.undo.gateDeleted(removed.label), () => {
      setProjectLanes(project.id, (prev) =>
        prev.map((l) => {
          if (l.id !== laneId) return l;
          const next = [...(l.gates ?? [])];
          next.splice(index, 0, removed);
          return { ...l, gates: next };
        }),
      );
    });
  }

  const sidebarActive: SidebarActive = settingsOpen
    ? "settings"
    : importOpen
      ? "import"
      : explorer
        ? "swimlines"
        : "none";

  // "What level am I on" — a literal Programa/Proyecto/Equipo/Plan/Fase
  // word per ancestor level, including the current one (unlike a typical
  // breadcrumb, the current level's own crumb still renders — it's what
  // tells you "this is a Fase view", not just the specific Fase's name,
  // which is the H1 title's job below). Every crumb still navigates:
  // clicking one jumps straight to that level, "Programa" leaves the
  // project entirely.
  const breadcrumbCrumbs: { label: string; onClick: () => void }[] = [
    { label: t.header.levelProgram, onClick: () => router.push("/") },
    { label: t.header.levelProject, onClick: () => setDrill(null) },
  ];
  if (drill) {
    breadcrumbCrumbs.push({ label: t.header.levelEquipo, onClick: () => setDrill({ level: "equipo", laneId: drill.laneId }) });
    if (drill.level === "plan" || drill.level === "fase") {
      breadcrumbCrumbs.push({
        label: t.header.levelPlan,
        onClick: () => setDrill({ level: "plan", laneId: drill.laneId, planId: drill.planId }),
      });
    }
    if (drill.level === "fase") {
      breadcrumbCrumbs.push({
        label: t.header.levelFase,
        onClick: () => setDrill({ level: "fase", laneId: drill.laneId, planId: drill.planId, phaseId: drill.phaseId }),
      });
    }
  }
  const headerTitle = !drill
    ? t.header.projectTitle(project.name)
    : drill.level === "equipo"
      ? equipoName(drill.laneId)
      : drill.level === "plan"
        ? planName(drill.laneId, drill.planId)
        : faseName(drill.laneId, drill.phaseId);

  const panelContent = explorer ? (
    <ExplorerPanel
      ref={sidePanel.panelRef}
      lanes={explorerLanes}
      startMonth={program.startMonth}
      view={explorer}
      getActivities={getActivities}
      onNavigate={setExplorer}
      onClose={sidePanel.closePanel}
      onAddLane={addLane}
      onRenameLane={handleRenameLane}
      projectName={project.name}
      onRenameProject={(name) => renameProject(project.id, name)}
      phasesEyebrowLabel={drill?.level === "equipo" ? t.header.levelPlan : undefined}
      onUpdatePhase={handleUpdatePhase}
      onAddPhase={handleAddPhase}
      onAddActivity={addActivity}
      onDeleteLane={deleteLane}
      onDeletePhase={handleDeletePhase}
      onDeleteActivity={deleteActivity}
      commentsByActivity={commentsByActivity}
      onAddComment={addComment}
      planOptions={planOptions}
      activeGateIds={new Set(activeGateIds)}
      onToggleGate={toggleGateActive}
      onAddGate={addGate}
      onUpdateGate={updateGate}
      onDeleteGate={deleteGate}
    />
  ) : importOpen ? (
    <ImportPanel
      ref={sidePanel.panelRef}
      startMonth={program.startMonth}
      months={program.months}
      mode="swimlines"
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
      program={program}
      onUpdateProgram={updateProgram}
      onClose={sidePanel.closePanel}
    />
  ) : null;

  return (
    <>
      <Sidebar
        active={sidebarActive}
        onSwimlines={() => openExplorer({ level: "lanes" })}
        onImport={openImportPanel}
        onSettings={openSettingsPanel}
        collapsed={settings.sidebarCollapsed}
        onToggleCollapsed={() => settings.setSidebarCollapsed(!settings.sidebarCollapsed)}
      />
      <NotificationBell alerts={notificationAlerts} />
      <main className={`${styles.main} ${settings.sidebarCollapsed ? styles.mainNavLeftCollapsed : styles.mainNavLeft}`}>
        <div className={styles.headerRow}>
          <div>
            <nav className={styles.breadcrumb} aria-label={t.header.breadcrumbAria}>
              {breadcrumbCrumbs.map((crumb, i) => (
                <span key={i}>
                  <button type="button" className={styles.breadcrumbCrumb} onClick={crumb.onClick}>
                    {crumb.label}
                  </button>
                  {i < breadcrumbCrumbs.length - 1 && (
                    <span className={styles.breadcrumbSep} aria-hidden="true"> / </span>
                  )}
                </span>
              ))}
            </nav>
            <h1 className={styles.title}>{headerTitle}</h1>
            <p className={styles.meta}>
              {lanes.length} {t.header.lanesWord} · {phaseCount} {t.header.phasesWord} · {program.months}{" "}
              {t.header.monthsWord} · {formatMonthRange(program.startMonth, program.months, MONTH_ABBR[locale])}
            </p>
          </div>
          {!anyPanelOpen && (
            <div className={styles.headerActions}>
              <button type="button" className={styles.importButton} onClick={openImportPanel}>
                {t.header.importButton}
              </button>
            </div>
          )}
        </div>

        {drill?.level === "equipo" && (
          <div className={explorerStyles.addGroup} style={{ margin: "0 0 14px" }}>
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
        )}

        <div className={styles.layout}>
          <div className={styles.calendarCol}>
            <PoapRenderer
              months={program.months}
              startMonth={program.startMonth}
              lanes={canvasLanes}
              bands={BANDS}
              selectedPhaseId={selectedPhaseId}
              onPhaseClick={handlePhaseClick}
              activeGateIds={activeGateIds}
              onGateClick={handleGateClick}
              onLaneClick={handleLaneClick}
              onLaneGanttClick={handleLaneGanttClick}
              activeGanttLaneId={explorer?.level === "phases" ? explorer.laneId : null}
              onCreatePhase={handleCreatePhase}
              onRenamePhase={handleRenamePhase}
              isLaneCreatable={isLaneCreatable}
              onResizePhase={(laneId, phaseId, start, end) => handleUpdatePhase(laneId, phaseId, { start, end })}
              onDeleteLane={canvasOnDeleteLane}
              onAddLaneBelow={canvasOnAddLaneBelow}
              onReorderLanes={canvasOnReorderLanes}
              isLaneManageable={canvasIsLaneManageable}
              locale={locale}
              showWeekends={settings.showWeekends}
              showToday={settings.showToday}
            />
          </div>
        </div>

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

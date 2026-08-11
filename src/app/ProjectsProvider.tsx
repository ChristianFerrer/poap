"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Gate, Lane, Phase } from "@/components/poap-renderer/types";
import type { Plan, Project } from "@/lib/portfolio";
import { activitiesFor, type ActivityComment, type ActivitySeed } from "./mock-data";
import { useLanguage } from "./i18n/LanguageProvider";
import { UndoToast } from "./UndoToast";
import { SyncErrorToast } from "./SyncErrorToast";
import {
  deletePlanRow,
  deleteProjectRow,
  errorMessage,
  fetchAppData,
  insertComment,
  insertPlan,
  insertProject,
  renamePlanRow,
  setSyncErrorHandler,
  syncPhaseActivities,
  syncProjectGates,
  syncProjectLanes,
  updateProgram as updateProgramRow,
  updatePlanSortOrder,
  updateProjectName,
  updateProjectNote,
  updateProjectSortOrder,
  type ProgramRow,
} from "@/lib/db";
import { PROGRAM as FALLBACK_PROGRAM } from "./mock-data";

// How long an undo stays offered before a delete becomes final.
const UNDO_WINDOW_MS = 6000;

export interface PendingUndo {
  message: string;
  undo: () => void;
}

interface ProjectsContextValue {
  /** True once the initial Supabase load has settled (success or
   * failure) — callers show a loading state until then instead of
   * flashing an empty program/project. */
  loaded: boolean;
  /** The Program's own name + shared timeline — a real, editable database
   * row (see src/lib/db.ts ProgramRow) rather than the hardcoded constant
   * this used to be. Falls back to the seed data's PROGRAM until the
   * initial load settles, same as `projects` defaulting to []. */
  program: ProgramRow;
  updateProgram: (patch: Partial<Pick<ProgramRow, "name" | "startMonth" | "months">>) => void;
  projects: Project[];
  /** Creates a project and returns its new id (synchronously — computed
   * off the current `projects` closure, not read back out of the setState
   * updater, so the caller can navigate to it immediately). */
  addProject: (input: { name: string; lanes: Lane[]; gates: Gate[] }) => string;
  /** One call, many new projects — see addProjects's own doc comment for
   * why this isn't just addProject in a loop. Returns the new ids in the
   * same order as `inputs`. */
  addProjects: (inputs: { name: string; lanes: Lane[]; gates: Gate[] }[]) => string[];
  /** The Program page's own "+ add a swimline below this one" action (see
   * PoapRenderer's onAddLaneBelow) — a project IS the Program page's
   * swimline, so this is that same capability, not a separate concept.
   * Seeds a default name and no lanes/gates; the user renames and builds
   * it out same as any freshly-created project. */
  addProjectBelow: (afterProjectId: string) => void;
  deleteProject: (projectId: string) => void;
  /** The Program page's own onReorderLanes target — every project's id in
   * its new display order. */
  reorderProjects: (orderedProjectIds: string[]) => void;
  /** A project's name is a single value, not two — the project-plan lane
   * that represents it on a Gantt row has its own `name` column for
   * historical/schema reasons, but nothing should ever read or edit that
   * column as if it were an independent name. This is the one place a
   * project gets renamed from. */
  renameProject: (projectId: string, name: string) => void;
  setProjectLanes: (projectId: string, updater: (lanes: Lane[]) => Lane[]) => void;
  setProjectGates: (projectId: string, updater: (gates: Gate[]) => Gate[]) => void;
  /** A team lane's own Planes (Equipo -> Plan -> Fase), keyed by lane id —
   * flat like activitiesByPhase rather than nested inside Lane, since
   * Phase.planId is what actually ties a phase to one. */
  plansByLane: Record<string, Plan[]>;
  addPlan: (laneId: string, name: string) => void;
  /** Bulk sibling of addPlan for callers (Excel import) that need each
   * Plan's id to exist before the provider ever sees it, so it can be
   * embedded in a Phase's planId at creation time. */
  addPlans: (plans: Plan[]) => void;
  /** The Equipo-drill canvas's own onAddLaneBelow target — see
   * addProjectBelow's doc comment for the same "insert in the middle,
   * renumber everyone after it" idea, one level down. */
  addPlanBelow: (laneId: string, afterPlanId: string) => void;
  renamePlan: (id: string, name: string) => void;
  deletePlan: (id: string) => void;
  /** The Equipo-drill canvas's own onReorderLanes target. */
  reorderPlans: (laneId: string, orderedPlanIds: string[]) => void;
  /** Short freeform status note surfaced on the Program page's executive
   * summary for projects that need one — not a project field teams edit
   * day to day, just the "why" a PMO/sponsor asks for without opening the
   * project. */
  setProjectNote: (projectId: string, note: string) => void;
  activitiesByPhase: Record<string, ActivitySeed[]>;
  /** Replaces one phase's activity list (add/delete/materialize a still-
   * virtual default breakdown) — the single choke point every activity
   * mutation goes through, so DB sync only has to live here once. `prev`
   * is `undefined` for a phase that has never been touched (still using
   * the client-computed default breakdown from activitiesFor). */
  updatePhaseActivities: (phaseId: string, updater: (prev: ActivitySeed[] | undefined) => ActivitySeed[]) => void;
  commentsByActivity: Record<string, ActivityComment[]>;
  /** Needs `phase`, not just the activity id, because a comment on a
   * still-virtual default activity (see updatePhaseActivities) has to
   * materialize that phase's activities first — a comment row's foreign
   * key can't point at an activity that doesn't exist in the database
   * yet. */
  addComment: (phase: Phase, activityId: string, text: string) => void;
  /** Every delete in the app (project/lane/phase/activity/gate) goes
   * through this instead of just mutating state — it's what lets a delete
   * happen instantly (no confirm dialog to click through) while still
   * being safe: the caller captures whatever it just removed and hands
   * back a closure that restores it, `announceUndo` shows that as the one
   * active toast, and it self-clears after UNDO_WINDOW_MS if nobody acts
   * on it. Only ever one pending at a time on purpose — deleting a second
   * thing before undoing the first supersedes it, same trade-off Gmail's
   * own "undo send" makes. */
  pendingUndo: PendingUndo | null;
  announceUndo: (message: string, undo: () => void) => void;
  consumeUndo: () => void;
  dismissUndo: () => void;
}

const ProjectsContext = createContext<ProjectsContextValue | null>(null);

// Strips accents by dropping every NFD combining mark (U+0300–U+036F) —
// built from character codes rather than a literal in the regex, since a
// literal combining-mark range is itself made of invisible combining
// marks in the source file.
const COMBINING_MARKS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, "g");

function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "proyecto";
}

/**
 * Holds every project's lanes/gates (and the activities/comments nested
 * under their phases) as one shared client-side store, rooted above both
 * the Program page and every Project page in layout.tsx — a plain
 * module-level constant wouldn't survive across pages the way this does,
 * since each page is its own component tree that fully mounts/unmounts on
 * navigation, but the root layout (and anything it renders above the
 * routed page) does not.
 *
 * Backed by Supabase (see src/lib/db.ts) as a write-through cache: local
 * React state is still the only thing the UI reads from — every mutation
 * updates it exactly as before persistence existed — but each mutating
 * function also fires a background (not awaited) write to the database,
 * so the same data is there on the next reload. Loaded once on mount;
 * see `loaded` for the one-time hydration flag callers gate rendering on.
 */
export function ProjectsProvider({ children }: { children: ReactNode }) {
  const { t } = useLanguage();
  const [loaded, setLoaded] = useState(false);
  const [program, setProgram] = useState<ProgramRow>({
    id: FALLBACK_PROGRAM.id,
    name: FALLBACK_PROGRAM.name,
    startMonth: FALLBACK_PROGRAM.startMonth,
    months: FALLBACK_PROGRAM.months,
  });
  const [projects, setProjects] = useState<Project[]>([]);
  const [plansByLane, setPlansByLane] = useState<Record<string, Plan[]>>({});
  const [activitiesByPhase, setActivitiesByPhase] = useState<Record<string, ActivitySeed[]>>({});
  const [commentsByActivity, setCommentsByActivity] = useState<Record<string, ActivityComment[]>>({});
  const [pendingUndo, setPendingUndo] = useState<PendingUndo | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const syncErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showSyncError(message: string) {
    if (syncErrorTimerRef.current) clearTimeout(syncErrorTimerRef.current);
    setSyncError(message);
    syncErrorTimerRef.current = setTimeout(() => setSyncError(null), 10000);
  }

  function dismissSyncError() {
    if (syncErrorTimerRef.current) clearTimeout(syncErrorTimerRef.current);
    setSyncError(null);
  }

  // One handler for every background write in src/lib/db.ts — registered
  // once, cleared on unmount so a stale provider instance (StrictMode's
  // double-mount in dev) never holds the live subscription.
  useEffect(() => {
    setSyncErrorHandler(showSyncError);
    return () => setSyncErrorHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    // A network failure normally rejects fast, but some retry/backoff
    // behavior deep in the fetch stack can stall well past that — without
    // a hard ceiling here, an unreachable database means "Cargando…"
    // forever instead of a visible error the user can actually act on.
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timed out reaching the database")), 15000),
    );
    Promise.race([fetchAppData(), timeout])
      .then((data) => {
        if (cancelled) return;
        if (data.program) setProgram(data.program);
        setProjects(data.projects);
        setPlansByLane(data.plansByLane);
        setActivitiesByPhase(data.activitiesByPhase);
        setCommentsByActivity(data.commentsByActivity);
      })
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.error("[ProjectsProvider] failed to load data from Supabase:", error);
        if (!cancelled) showSyncError(errorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function announceUndo(message: string, undo: () => void) {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setPendingUndo({ message, undo });
    undoTimerRef.current = setTimeout(() => setPendingUndo(null), UNDO_WINDOW_MS);
  }

  function dismissUndo() {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setPendingUndo(null);
  }

  // Reads `pendingUndo` from this render's closure rather than a state
  // updater — the toast that calls this only ever renders from the same
  // render that closed over the current pendingUndo, so there's no
  // staleness risk, and running the restore as a real side effect (not
  // inside setState) avoids it firing twice under StrictMode.
  function consumeUndo() {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    pendingUndo?.undo();
    setPendingUndo(null);
  }

  function updateProgram(patch: Partial<Pick<ProgramRow, "name" | "startMonth" | "months">>) {
    setProgram((prev) => ({ ...prev, ...patch }));
    void updateProgramRow(program.id, patch);
  }

  /** Picks an id for `name` that isn't already in `taken` — and adds it to
   * `taken`, so a caller minting several ids in the same batch (see
   * addProjects below) never hands out the same one twice, the way calling
   * addProject in a loop would (each call only sees `projects` as of the
   * last completed render, not its own loop siblings that haven't landed
   * in state yet). */
  function nextUniqueId(name: string, taken: Set<string>): string {
    const base = slugify(name);
    let id = base;
    let suffix = 2;
    while (taken.has(id)) {
      id = `${base}-${suffix}`;
      suffix += 1;
    }
    taken.add(id);
    return id;
  }

  function addProject(input: { name: string; lanes: Lane[]; gates: Gate[] }): string {
    const id = nextUniqueId(input.name, new Set(projects.map((p) => p.id)));
    const project: Project = { id, name: input.name, sortOrder: projects.length, lanes: input.lanes, gates: input.gates };
    setProjects((prev) => [...prev, project]);
    void insertProject(project);
    return id;
  }

  /** Bulk sibling of addProject — every id/sortOrder in the batch is
   * computed against the same starting snapshot plus its own batch
   * siblings, so importing several projects from one Excel workbook in one
   * go can't collide ids or double-assign a sortOrder the way N sequential
   * addProject calls would. */
  function addProjects(inputs: { name: string; lanes: Lane[]; gates: Gate[] }[]): string[] {
    const taken = new Set(projects.map((p) => p.id));
    const newProjects: Project[] = inputs.map((input, i) => ({
      id: nextUniqueId(input.name, taken),
      name: input.name,
      sortOrder: projects.length + i,
      lanes: input.lanes,
      gates: input.gates,
    }));
    setProjects((prev) => [...prev, ...newProjects]);
    newProjects.forEach((project) => void insertProject(project));
    return newProjects.map((p) => p.id);
  }

  // Inserting in the middle (not just appending) means every project after
  // the insertion point shifts by one — unlike addProjects' always-append
  // case, those shifted sortOrders are real, persisted changes too, so
  // every one of them gets its own updateProjectSortOrder call, not just
  // the new project's insertProject.
  function addProjectBelow(afterProjectId: string) {
    const id = nextUniqueId(t.addProject.defaultProjectName, new Set(projects.map((p) => p.id)));
    const newProject: Project = { id, name: t.addProject.defaultProjectName, sortOrder: 0, lanes: [], gates: [] };
    const ordered = [...projects].sort((a, b) => a.sortOrder - b.sortOrder);
    const afterIndex = ordered.findIndex((p) => p.id === afterProjectId);
    const next = [...ordered];
    next.splice(afterIndex === -1 ? next.length : afterIndex + 1, 0, newProject);
    const renumbered = next.map((p, i) => ({ ...p, sortOrder: i }));
    setProjects(renumbered);
    void insertProject(newProject);
    for (const p of renumbered) if (p.id !== newProject.id) void updateProjectSortOrder(p.id, p.sortOrder);
  }

  function deleteProject(projectId: string) {
    const index = projects.findIndex((p) => p.id === projectId);
    if (index === -1) return;
    const removed = projects[index]!;
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    void deleteProjectRow(projectId);
    announceUndo(t.undo.projectDeleted(removed.name), () => {
      setProjects((prev) => {
        const next = [...prev];
        next.splice(index, 0, removed);
        return next;
      });
      void insertProject(removed);
    });
  }

  // Keeps the plan lane's own `name` column (a leftover of it being a
  // regular `lanes` row before isProjectPlan existed) mirrored to the
  // project's name in the database too — not just hidden client-side —
  // so a lane rename never drifts away from its project again, even for
  // anyone who queries `lanes` directly.
  function renameProject(projectId: string, name: string) {
    const prevLanes = projects.find((p) => p.id === projectId)?.lanes ?? [];
    const nextLanes = prevLanes.map((l) => (l.isProjectPlan ? { ...l, name } : l));
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, name, lanes: nextLanes } : p)));
    void updateProjectName(projectId, name);
    if (prevLanes.some((l) => l.isProjectPlan)) void syncProjectLanes(projectId, prevLanes, nextLanes);
  }

  // Program-page drag-and-drop reordering (see PoapRenderer's
  // onReorderLanes) — every project is a "regular" swimline there (no
  // isProjectPlan anchor concept at that level), so unlike
  // useProjectSwimlines.reorderLanes this never has to exclude one.
  function reorderProjects(orderedProjectIds: string[]) {
    const orderIndex = new Map(orderedProjectIds.map((id, i) => [id, i]));
    setProjects((prev) => prev.map((p) => (orderIndex.has(p.id) ? { ...p, sortOrder: orderIndex.get(p.id)! } : p)));
    orderedProjectIds.forEach((id, i) => void updateProjectSortOrder(id, i));
  }

  function setProjectLanes(projectId: string, updater: (lanes: Lane[]) => Lane[]) {
    const prevLanes = projects.find((p) => p.id === projectId)?.lanes ?? [];
    const nextLanes = updater(prevLanes);
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, lanes: nextLanes } : p)));
    void syncProjectLanes(projectId, prevLanes, nextLanes);
  }

  function setProjectGates(projectId: string, updater: (gates: Gate[]) => Gate[]) {
    const prevGates = projects.find((p) => p.id === projectId)?.gates ?? [];
    const nextGates = updater(prevGates);
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, gates: nextGates } : p)));
    void syncProjectGates(projectId, prevGates, nextGates);
  }

  function setProjectNote(projectId: string, note: string) {
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, note } : p)));
    void updateProjectNote(projectId, note);
  }

  function updatePhaseActivities(phaseId: string, updater: (prev: ActivitySeed[] | undefined) => ActivitySeed[]) {
    const prev = activitiesByPhase[phaseId];
    const next = updater(prev);
    if (next === prev) return;
    setActivitiesByPhase((p) => ({ ...p, [phaseId]: next }));
    void syncPhaseActivities(phaseId, prev, next);
  }

  async function addComment(phase: Phase, activityId: string, text: string) {
    // A comment's foreign key needs a real activities row to point at —
    // if this phase is still using the client-computed default breakdown
    // (no DB rows yet), materialize it first and wait for that write
    // before inserting the comment.
    const prevActivities = activitiesByPhase[phase.id];
    if (!prevActivities) {
      const materialized = activitiesFor(phase);
      setActivitiesByPhase((p) => ({ ...p, [phase.id]: materialized }));
      await syncPhaseActivities(phase.id, undefined, materialized);
    }
    const comment: ActivityComment = { author: t.explorer.commentAuthorYou, date: t.explorer.commentDateJustNow, text };
    setCommentsByActivity((prev) => ({ ...prev, [activityId]: [...(prev[activityId] ?? []), comment] }));
    await insertComment(activityId, comment);
  }

  function addPlan(laneId: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const existing = plansByLane[laneId] ?? [];
    const plan: Plan = { id: crypto.randomUUID(), laneId, name: trimmed, sortOrder: existing.length };
    setPlansByLane((prev) => ({ ...prev, [laneId]: [...(prev[laneId] ?? []), plan] }));
    void insertPlan(plan);
  }

  // Bulk sibling of addPlan, for callers that already minted their own
  // Plan ids up front (see the Excel-import flow: it needs a phase's
  // planId to point at a real Plan the moment the phase itself is
  // created, so the id has to exist before any provider call happens —
  // addPlan's own crypto.randomUUID() would be too late for that). Takes
  // fully-formed Plan objects as-is, same "insert every already-built
  // record and persist each" shape as addProjects.
  function addPlans(newPlans: Plan[]) {
    if (newPlans.length === 0) return;
    setPlansByLane((prev) => {
      const next = { ...prev };
      for (const plan of newPlans) next[plan.laneId] = [...(next[plan.laneId] ?? []), plan];
      return next;
    });
    newPlans.forEach((plan) => void insertPlan(plan));
  }

  // Equipo-drill's own "+ add a plan below this one" (see PoapRenderer's
  // onAddLaneBelow) — same insert-after-and-renumber pattern as
  // addProjectBelow, just scoped to one team lane's own Planes instead of
  // the whole Program. afterPlanId is the *team lane's own* id (not a real
  // Plan) when the anchor row's own "+" fired — same "insert at 0" case
  // useProjectSwimlines.addLaneBelow handles for its plan-lane anchor.
  function addPlanBelow(laneId: string, afterPlanId: string) {
    const existing = plansByLane[laneId] ?? [];
    const newPlan: Plan = { id: crypto.randomUUID(), laneId, name: t.plansNav.defaultPlanName, sortOrder: 0 };
    const ordered = [...existing].sort((a, b) => a.sortOrder - b.sortOrder);
    const afterIndex = ordered.findIndex((p) => p.id === afterPlanId);
    // Not a real Plan id and not the anchor either — afterPlanId is the
    // synthetic "Sin plan asignado" bucket, which always sorts last (see
    // groupPhasesByPlan), so appending is the only insertion that keeps
    // this new Plan visually "below" it like the click implied.
    const insertAt = afterPlanId === laneId ? 0 : afterIndex === -1 ? ordered.length : afterIndex + 1;
    const next = [...ordered];
    next.splice(insertAt, 0, newPlan);
    const renumbered = next.map((p, i) => ({ ...p, sortOrder: i }));
    setPlansByLane((prev) => ({ ...prev, [laneId]: renumbered }));
    void insertPlan(newPlan);
    for (const p of renumbered) if (p.id !== newPlan.id) void updatePlanSortOrder(p.id, p.sortOrder);
  }

  // Equipo-drill's own onReorderLanes target — a team lane's Planes reorder
  // independently of every other lane's, so unlike reorderProjects this
  // takes laneId too and only ever touches that one lane's slice of
  // plansByLane.
  function reorderPlans(laneId: string, orderedPlanIds: string[]) {
    const orderIndex = new Map(orderedPlanIds.map((id, i) => [id, i]));
    setPlansByLane((prev) => ({
      ...prev,
      [laneId]: (prev[laneId] ?? []).map((p) => (orderIndex.has(p.id) ? { ...p, sortOrder: orderIndex.get(p.id)! } : p)),
    }));
    orderedPlanIds.forEach((id, i) => void updatePlanSortOrder(id, i));
  }

  function renamePlan(id: string, name: string) {
    setPlansByLane((prev) => {
      const next: Record<string, Plan[]> = {};
      for (const [laneId, plans] of Object.entries(prev)) {
        next[laneId] = plans.map((p) => (p.id === id ? { ...p, name } : p));
      }
      return next;
    });
    void renamePlanRow(id, name);
  }

  function deletePlan(id: string) {
    let removedLaneId: string | null = null;
    let removedIndex = -1;
    let removedPlan: Plan | null = null;
    for (const [laneId, plans] of Object.entries(plansByLane)) {
      const index = plans.findIndex((p) => p.id === id);
      if (index !== -1) {
        removedLaneId = laneId;
        removedIndex = index;
        removedPlan = plans[index]!;
        break;
      }
    }
    if (!removedLaneId || !removedPlan) return;
    const laneId = removedLaneId;
    const plan = removedPlan;
    const index = removedIndex;
    setPlansByLane((prev) => ({ ...prev, [laneId]: (prev[laneId] ?? []).filter((p) => p.id !== id) }));
    void deletePlanRow(id);
    // Phases that pointed at this Plan aren't touched — they just fall
    // into groupPhasesByPlan's "unassigned" bucket until reassigned, same
    // "never hide an orphan" rule the linkage alert already follows.
    announceUndo(t.undo.planDeleted(plan.name), () => {
      setPlansByLane((prev) => {
        const next = [...(prev[laneId] ?? [])];
        next.splice(index, 0, plan);
        return { ...prev, [laneId]: next };
      });
      void insertPlan(plan);
    });
  }

  return (
    <ProjectsContext.Provider
      value={{
        loaded,
        program,
        updateProgram,
        projects,
        addProject,
        addProjects,
        addProjectBelow,
        deleteProject,
        reorderProjects,
        renameProject,
        setProjectLanes,
        setProjectGates,
        plansByLane,
        addPlan,
        addPlans,
        addPlanBelow,
        renamePlan,
        deletePlan,
        reorderPlans,
        setProjectNote,
        activitiesByPhase,
        updatePhaseActivities,
        commentsByActivity,
        addComment,
        pendingUndo,
        announceUndo,
        consumeUndo,
        dismissUndo,
      }}
    >
      {children}
      <UndoToast />
      <SyncErrorToast message={syncError} onDismiss={dismissSyncError} />
    </ProjectsContext.Provider>
  );
}

export function useProjects(): ProjectsContextValue {
  const ctx = useContext(ProjectsContext);
  if (!ctx) throw new Error("useProjects must be used within a ProjectsProvider");
  return ctx;
}

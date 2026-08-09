"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Gate, Lane, Phase } from "@/components/poap-renderer/types";
import type { Plan, Project, StageCategoryDef } from "@/lib/portfolio";
import { activitiesFor, type ActivityComment, type ActivitySeed } from "./mock-data";
import { useLanguage } from "./i18n/LanguageProvider";
import { UndoToast } from "./UndoToast";
import { SyncErrorToast } from "./SyncErrorToast";
import {
  deletePlanRow,
  deleteProjectRow,
  deleteStageCategoryRow,
  errorMessage,
  fetchAppData,
  insertComment,
  insertPlan,
  insertProject,
  insertStageCategory,
  renamePlanRow,
  setSyncErrorHandler,
  syncPhaseActivities,
  syncProjectGates,
  syncProjectLanes,
  updateProgram as updateProgramRow,
  updateProjectName,
  updateProjectNote,
  updateStageCategoryLabel,
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
  deleteProject: (projectId: string) => void;
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
  renamePlan: (id: string, name: string) => void;
  deletePlan: (id: string) => void;
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
  /** The live, user-editable stage lifecycle (Settings → Fases de
   * proyecto) — what AddProjectPanel and ExplorerPanel's category picker
   * offer, and what deriveProjectSummary aggregates by. Loaded from the
   * database, freely renameable/extendable/deletable from here on; a
   * Phase only ever stores a category *id*, so renaming one updates every
   * phase's displayed stage for free. */
  stageCategories: StageCategoryDef[];
  addStageCategory: (label: string) => void;
  renameStageCategory: (id: string, label: string) => void;
  deleteStageCategory: (id: string) => void;
  /** Every delete in the app (project/lane/phase/activity/gate/stage) goes
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
  const [stageCategories, setStageCategories] = useState<StageCategoryDef[]>([]);
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
        setStageCategories(data.stageCategories);
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

  function addProject(input: { name: string; lanes: Lane[]; gates: Gate[] }): string {
    const base = slugify(input.name);
    const existingIds = new Set(projects.map((p) => p.id));
    let id = base;
    let suffix = 2;
    while (existingIds.has(id)) {
      id = `${base}-${suffix}`;
      suffix += 1;
    }
    const project: Project = { id, name: input.name, sortOrder: projects.length, lanes: input.lanes, gates: input.gates };
    setProjects((prev) => [...prev, project]);
    void insertProject(project);
    return id;
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

  function addStageCategory(label: string) {
    const trimmed = label.trim();
    if (!trimmed) return;
    const category: StageCategoryDef = { id: crypto.randomUUID(), label: trimmed };
    const sortOrder = stageCategories.length;
    setStageCategories((prev) => [...prev, category]);
    void insertStageCategory(category, sortOrder);
  }

  function renameStageCategory(id: string, label: string) {
    setStageCategories((prev) => prev.map((c) => (c.id === id ? { ...c, label } : c)));
    void updateStageCategoryLabel(id, label);
  }

  function deleteStageCategory(id: string) {
    const index = stageCategories.findIndex((c) => c.id === id);
    if (index === -1) return;
    const removed = stageCategories[index]!;
    setStageCategories((prev) => prev.filter((c) => c.id !== id));
    void deleteStageCategoryRow(id);
    announceUndo(t.undo.stageDeleted(removed.label), () => {
      setStageCategories((prev) => {
        const next = [...prev];
        next.splice(index, 0, removed);
        return next;
      });
      void insertStageCategory(removed, index);
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
        deleteProject,
        renameProject,
        setProjectLanes,
        setProjectGates,
        plansByLane,
        addPlan,
        renamePlan,
        deletePlan,
        setProjectNote,
        activitiesByPhase,
        updatePhaseActivities,
        commentsByActivity,
        addComment,
        stageCategories,
        addStageCategory,
        renameStageCategory,
        deleteStageCategory,
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

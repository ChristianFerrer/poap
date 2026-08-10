import { supabase } from "./supabaseClient";
import type { Gate, Lane, Phase, PhaseStatus } from "@/components/poap-renderer/types";
import type { Plan, Project, StageCategoryDef } from "@/lib/portfolio";
import type { ActivityComment, ActivitySeed } from "@/app/mock-data";

/**
 * The persistence layer for everything ProjectsProvider used to hold only
 * in memory. Every function here is called as a write-through side effect
 * alongside a local setState — local React state stays the fast read
 * model the UI renders from (unchanged from before persistence existed),
 * this module just mirrors each change to Postgres in the background so
 * it survives a reload. Failures are logged, not surfaced to the user —
 * the local state the UI already committed to is never rolled back, since
 * this is a low-stakes internal tool and a failed write here is still
 * strictly better than the pre-persistence baseline of "always resets".
 */

// A failed write is still logged to the console for full detail, but that's
// invisible unless someone has devtools open — this also notifies a single
// subscriber (see ProjectsProvider) so a small toast can surface it in the
// UI itself. Module-level rather than routed through context/props since
// every write-through function in this file needs to reach it identically,
// regardless of call depth.
let onSyncError: ((message: string) => void) | null = null;

export function setSyncErrorHandler(handler: ((message: string) => void) | null) {
  onSyncError = handler;
}

/** Supabase/Postgrest errors are plain `{message, details, hint, code}`
 * objects, not real `Error` instances — `String(...)` on one of those
 * (or on a rejected-Promise.all's opaque wrapper) just prints
 * "[object Object]". Pull `.message` out explicitly wherever it exists,
 * falling back to JSON so there's always *something* legible instead. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function logFailure(action: string, error: unknown) {
  // eslint-disable-next-line no-console
  console.error(`[db] ${action} failed:`, error);
  onSyncError?.(errorMessage(error));
}

// ---------------------------------------------------------------------
// Hydration — one batched load, called once on mount.
// ---------------------------------------------------------------------

export interface ProgramRow {
  id: string;
  name: string;
  startMonth: string;
  months: number;
}

interface AppData {
  program: ProgramRow | null;
  projects: Project[];
  plansByLane: Record<string, Plan[]>;
  activitiesByPhase: Record<string, ActivitySeed[]>;
  commentsByActivity: Record<string, ActivityComment[]>;
  stageCategories: StageCategoryDef[];
}

export async function fetchAppData(): Promise<AppData> {
  const [
    { data: programRows, error: programError },
    { data: stageCategoryRows, error: stageCategoriesError },
    { data: projectRows, error: projectsError },
    { data: laneRows, error: lanesError },
    { data: planRows, error: plansError },
    { data: phaseRows, error: phasesError },
    { data: gateRows, error: gatesError },
    { data: activityRows, error: activitiesError },
    { data: commentRows, error: commentsError },
  ] = await Promise.all([
    supabase.from("programs").select("*").limit(1),
    supabase.from("stage_categories").select("*").order("sort_order"),
    supabase.from("projects").select("*").order("sort_order"),
    supabase.from("lanes").select("*").order("sort_order"),
    supabase.from("plans").select("*").order("sort_order"),
    supabase.from("phases").select("*"),
    supabase.from("gates").select("*").order("position"),
    supabase.from("activities").select("*"),
    supabase.from("activity_comments").select("*").order("created_at"),
  ]);

  const firstError =
    programError || stageCategoriesError || projectsError || lanesError || plansError || phasesError || gatesError || activitiesError || commentsError;
  if (firstError) throw firstError;

  const plansByLane: Record<string, Plan[]> = {};
  for (const r of planRows ?? []) {
    const plan: Plan = { id: r.id, laneId: r.lane_id, name: r.name, sortOrder: r.sort_order };
    (plansByLane[r.lane_id] ??= []).push(plan);
  }

  const programRow = programRows?.[0];
  const program: ProgramRow | null = programRow
    ? { id: programRow.id, name: programRow.name, startMonth: programRow.start_month, months: programRow.months }
    : null;

  const stageCategories: StageCategoryDef[] = (stageCategoryRows ?? []).map((r) => ({ id: r.id, label: r.label }));

  const phasesByLane = new Map<string, Phase[]>();
  for (const r of phaseRows ?? []) {
    const phase: Phase = {
      id: r.id,
      title: r.title,
      start: r.start_day,
      end: r.end_day,
      status: r.status as PhaseStatus,
      category: r.category ?? undefined,
      planId: r.plan_id ?? undefined,
      subLane: r.sub_lane ?? undefined,
      owners: r.owners ?? undefined,
    };
    const group = phasesByLane.get(r.lane_id) ?? [];
    group.push(phase);
    phasesByLane.set(r.lane_id, group);
  }

  const lanesByProject = new Map<string, Lane[]>();
  for (const r of laneRows ?? []) {
    const lane: Lane = {
      id: r.id,
      name: r.name,
      sortOrder: r.sort_order,
      phases: phasesByLane.get(r.id) ?? [],
      isProjectPlan: r.is_project_plan ?? false,
    };
    const group = lanesByProject.get(r.project_id) ?? [];
    group.push(lane);
    lanesByProject.set(r.project_id, group);
  }

  const gatesByProject = new Map<string, Gate[]>();
  for (const r of gateRows ?? []) {
    const gate: Gate = { id: r.id, label: r.label, position: r.position };
    const group = gatesByProject.get(r.project_id) ?? [];
    group.push(gate);
    gatesByProject.set(r.project_id, group);
  }

  const projects: Project[] = (projectRows ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    sortOrder: r.sort_order,
    note: r.note ?? undefined,
    lanes: lanesByProject.get(r.id) ?? [],
    gates: gatesByProject.get(r.id) ?? [],
  }));

  const commentsByActivity: Record<string, ActivityComment[]> = {};
  for (const r of commentRows ?? []) {
    const comment: ActivityComment = { author: r.author, date: r.comment_date, text: r.body };
    (commentsByActivity[r.activity_id] ??= []).push(comment);
  }

  const activitiesByPhase: Record<string, ActivitySeed[]> = {};
  for (const r of activityRows ?? []) {
    const activity: ActivitySeed = {
      id: r.id,
      title: r.title,
      owner: r.owner,
      start: r.start_day,
      end: r.end_day,
      status: r.status as PhaseStatus,
    };
    (activitiesByPhase[r.phase_id] ??= []).push(activity);
  }

  return { program, projects, plansByLane, activitiesByPhase, commentsByActivity, stageCategories };
}

// ---------------------------------------------------------------------
// Program — a single row (id "program-1", seeded by migration). No
// insert/delete path: the program itself is provisioned once by the
// database, this only ever patches name/timeline.
// ---------------------------------------------------------------------

export async function updateProgram(id: string, patch: Partial<Pick<ProgramRow, "name" | "startMonth" | "months">>) {
  try {
    const row: Record<string, unknown> = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.startMonth !== undefined) row.start_month = patch.startMonth;
    if (patch.months !== undefined) row.months = patch.months;
    const { error } = await supabase.from("programs").update(row).eq("id", id);
    if (error) throw error;
  } catch (error) {
    logFailure(`updateProgram(${id})`, error);
  }
}

// ---------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------

/** Inserts a project and everything nested under it — used both for a
 * brand-new project (which may already carry initial lanes/gates from the
 * add-project form or an Excel import) and to restore one on undo. */
export async function insertProject(project: Project) {
  try {
    const { error: projectError } = await supabase
      .from("projects")
      .insert({ id: project.id, name: project.name, sort_order: project.sortOrder, note: project.note ?? null });
    if (projectError) throw projectError;

    if (project.lanes.length > 0) {
      const { error: lanesError } = await supabase.from("lanes").insert(project.lanes.map((l) => laneToRow(l, project.id)));
      if (lanesError) throw lanesError;

      const phaseRows = project.lanes.flatMap((l) => l.phases.map((p) => phaseToRow(p, l.id)));
      if (phaseRows.length > 0) {
        const { error: phasesError } = await supabase.from("phases").insert(phaseRows);
        if (phasesError) throw phasesError;
      }
    }

    if (project.gates.length > 0) {
      const { error: gatesError } = await supabase
        .from("gates")
        .insert(project.gates.map((g) => ({ id: g.id, project_id: project.id, label: g.label, position: g.position })));
      if (gatesError) throw gatesError;
    }
  } catch (error) {
    logFailure(`insertProject(${project.id})`, error);
  }
}

export async function deleteProjectRow(id: string) {
  try {
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) throw error;
  } catch (error) {
    logFailure(`deleteProjectRow(${id})`, error);
  }
}

export async function updateProjectNote(id: string, note: string) {
  try {
    const { error } = await supabase.from("projects").update({ note }).eq("id", id);
    if (error) throw error;
  } catch (error) {
    logFailure(`updateProjectNote(${id})`, error);
  }
}

export async function updateProjectName(id: string, name: string) {
  try {
    const { error } = await supabase.from("projects").update({ name }).eq("id", id);
    if (error) throw error;
  } catch (error) {
    logFailure(`updateProjectName(${id})`, error);
  }
}

export async function updateProjectSortOrder(id: string, sortOrder: number) {
  try {
    const { error } = await supabase.from("projects").update({ sort_order: sortOrder }).eq("id", id);
    if (error) throw error;
  } catch (error) {
    logFailure(`updateProjectSortOrder(${id})`, error);
  }
}

// ---------------------------------------------------------------------
// Lanes + phases — one project's full lanes array is diffed against
// whatever it was before, so any caller that already has a
// `(prev) => next` updater (add/rename/delete lane, edit/add/delete
// phase, import) gets DB sync for free without its own bespoke query.
// ---------------------------------------------------------------------

function laneToRow(lane: Lane, projectId: string) {
  return { id: lane.id, project_id: projectId, name: lane.name, sort_order: lane.sortOrder, is_project_plan: lane.isProjectPlan ?? false };
}

function phaseToRow(phase: Phase, laneId: string) {
  return {
    id: phase.id,
    lane_id: laneId,
    title: phase.title,
    start_day: phase.start,
    end_day: phase.end,
    status: phase.status,
    category: phase.category ?? null,
    plan_id: phase.planId ?? null,
    sub_lane: phase.subLane ?? null,
    owners: phase.owners ?? null,
  };
}

export async function syncProjectLanes(projectId: string, prevLanes: Lane[], nextLanes: Lane[]) {
  try {
    const prevLaneIds = new Set(prevLanes.map((l) => l.id));
    const nextLaneIds = new Set(nextLanes.map((l) => l.id));
    const removedLaneIds = [...prevLaneIds].filter((id) => !nextLaneIds.has(id));

    const prevPhaseIds = new Set(prevLanes.flatMap((l) => l.phases.map((p) => p.id)));
    const nextPhaseIds = new Set(nextLanes.flatMap((l) => l.phases.map((p) => p.id)));
    // Phases removed from a lane that still exists — phases under a
    // removed lane are already gone via that lane's own cascade delete,
    // so re-deleting them here would be redundant (harmless, but skipped).
    const removedPhaseIds = [...prevPhaseIds].filter((id) => !nextPhaseIds.has(id) && !removedLaneIds.includes(laneIdForPhase(prevLanes, id)));

    if (nextLanes.length > 0) {
      const { error } = await supabase.from("lanes").upsert(nextLanes.map((l) => laneToRow(l, projectId)));
      if (error) throw error;
    }

    const phaseRows = nextLanes.flatMap((l) => l.phases.map((p) => phaseToRow(p, l.id)));
    if (phaseRows.length > 0) {
      const { error } = await supabase.from("phases").upsert(phaseRows);
      if (error) throw error;
    }

    if (removedPhaseIds.length > 0) {
      const { error } = await supabase.from("phases").delete().in("id", removedPhaseIds);
      if (error) throw error;
    }
    if (removedLaneIds.length > 0) {
      const { error } = await supabase.from("lanes").delete().in("id", removedLaneIds);
      if (error) throw error;
    }
  } catch (error) {
    logFailure(`syncProjectLanes(${projectId})`, error);
  }
}

function laneIdForPhase(lanes: Lane[], phaseId: string): string {
  return lanes.find((l) => l.phases.some((p) => p.id === phaseId))?.id ?? "";
}

// ---------------------------------------------------------------------
// Plans — a team lane's own sub-grouping of its phases (see the Plan type
// in src/lib/portfolio.ts). Simple targeted calls like stage categories
// below, not a diffed collection, since a Plan list changes one row at a
// time from its own small "add plan" form rather than as part of some
// larger array edit.
// ---------------------------------------------------------------------

export async function insertPlan(plan: Plan) {
  try {
    const { error } = await supabase
      .from("plans")
      .insert({ id: plan.id, lane_id: plan.laneId, name: plan.name, sort_order: plan.sortOrder });
    if (error) throw error;
  } catch (error) {
    logFailure(`insertPlan(${plan.id})`, error);
  }
}

export async function renamePlanRow(id: string, name: string) {
  try {
    const { error } = await supabase.from("plans").update({ name }).eq("id", id);
    if (error) throw error;
  } catch (error) {
    logFailure(`renamePlanRow(${id})`, error);
  }
}

export async function deletePlanRow(id: string) {
  try {
    const { error } = await supabase.from("plans").delete().eq("id", id);
    if (error) throw error;
  } catch (error) {
    logFailure(`deletePlanRow(${id})`, error);
  }
}

export async function updatePlanSortOrder(id: string, sortOrder: number) {
  try {
    const { error } = await supabase.from("plans").update({ sort_order: sortOrder }).eq("id", id);
    if (error) throw error;
  } catch (error) {
    logFailure(`updatePlanSortOrder(${id})`, error);
  }
}

// ---------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------

export async function syncProjectGates(projectId: string, prevGates: Gate[], nextGates: Gate[]) {
  try {
    const prevIds = new Set(prevGates.map((g) => g.id));
    const nextIds = new Set(nextGates.map((g) => g.id));
    const removedIds = [...prevIds].filter((id) => !nextIds.has(id));

    if (nextGates.length > 0) {
      const { error } = await supabase
        .from("gates")
        .upsert(nextGates.map((g) => ({ id: g.id, project_id: projectId, label: g.label, position: g.position })));
      if (error) throw error;
    }
    if (removedIds.length > 0) {
      const { error } = await supabase.from("gates").delete().in("id", removedIds);
      if (error) throw error;
    }
  } catch (error) {
    logFailure(`syncProjectGates(${projectId})`, error);
  }
}

// ---------------------------------------------------------------------
// Stage categories — already granular per-call-site handlers, so plain
// targeted inserts/updates/deletes rather than a diffed collection.
// ---------------------------------------------------------------------

export async function insertStageCategory(category: StageCategoryDef, sortOrder: number) {
  try {
    const { error } = await supabase.from("stage_categories").insert({ id: category.id, label: category.label, sort_order: sortOrder });
    if (error) throw error;
  } catch (error) {
    logFailure(`insertStageCategory(${category.id})`, error);
  }
}

export async function updateStageCategoryLabel(id: string, label: string) {
  try {
    const { error } = await supabase.from("stage_categories").update({ label }).eq("id", id);
    if (error) throw error;
  } catch (error) {
    logFailure(`updateStageCategoryLabel(${id})`, error);
  }
}

export async function deleteStageCategoryRow(id: string) {
  try {
    const { error } = await supabase.from("stage_categories").delete().eq("id", id);
    if (error) throw error;
  } catch (error) {
    logFailure(`deleteStageCategoryRow(${id})`, error);
  }
}

// ---------------------------------------------------------------------
// Activities — one phase's full activity list is diffed the same way
// lanes are, since "add/delete an activity" and "materialize this
// phase's still-virtual default activities on first touch" are really
// the same operation: replace the phase's list with a new one.
// ---------------------------------------------------------------------

function activityToRow(activity: ActivitySeed, phaseId: string) {
  return {
    id: activity.id,
    phase_id: phaseId,
    title: activity.title,
    owner: activity.owner,
    start_day: activity.start,
    end_day: activity.end,
    status: activity.status,
  };
}

export async function syncPhaseActivities(phaseId: string, prevActivities: ActivitySeed[] | undefined, nextActivities: ActivitySeed[]) {
  try {
    const prevIds = new Set((prevActivities ?? []).map((a) => a.id));
    const nextIds = new Set(nextActivities.map((a) => a.id));
    const removedIds = [...prevIds].filter((id) => !nextIds.has(id));

    if (nextActivities.length > 0) {
      const { error } = await supabase.from("activities").upsert(nextActivities.map((a) => activityToRow(a, phaseId)));
      if (error) throw error;
    }
    if (removedIds.length > 0) {
      const { error } = await supabase.from("activities").delete().in("id", removedIds);
      if (error) throw error;
    }
  } catch (error) {
    logFailure(`syncPhaseActivities(${phaseId})`, error);
  }
}

// ---------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------

export async function insertComment(activityId: string, comment: ActivityComment) {
  try {
    const { error } = await supabase
      .from("activity_comments")
      .insert({ activity_id: activityId, author: comment.author, comment_date: comment.date, body: comment.text });
    if (error) throw error;
  } catch (error) {
    logFailure(`insertComment(${activityId})`, error);
  }
}

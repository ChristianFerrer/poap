import type { Gate, Lane, Phase, PhaseStatus } from "@/components/poap-renderer/types";

/**
 * A team lane's (Equipo's) own sub-grouping of its phases — one level
 * between Equipo and Fase (Equipo -> Plan -> Fase), a different concept
 * from the project-wide "Plan del proyecto" anchor lane (Lane.isProjectPlan)
 * despite the name overlap: this is per-team, that one is per-project.
 * Kept as a flat list per lane (see ProjectsProvider's plansByLane) rather
 * than nested inside Lane, the same way activities live in a flat
 * activitiesByPhase map instead of inside Phase — Phase.planId is what
 * actually ties a phase to one of these.
 */
export interface Plan {
  id: string;
  laneId: string;
  name: string;
  sortOrder: number;
}

/** Sentinel id for the synthetic "no Plan yet" bucket a team lane's
 * unassigned phases get grouped under (see groupPhasesByPlan) — shared so
 * every caller that needs to recognize or target that bucket (the project
 * page's drill state, ExplorerPanel's phases view) uses the exact same
 * value instead of each re-declaring its own copy. */
export const UNASSIGNED_PLAN_ID = "__unassigned__";

/**
 * A Project is one level below Program: its own set of team lanes (exactly
 * what the existing single-project app already modeled), plus its own
 * stage gates. Deliberately no startMonth/months of its own — every
 * project in a Program shares that Program's one timeline (see Program
 * below), so a phase's axis position never needs re-basing when moving
 * between the portfolio view and a project's own detail view.
 */
export interface Project {
  id: string;
  name: string;
  sortOrder: number;
  lanes: Lane[];
  gates: Gate[];
  /** Short freeform status note ("why is this at risk") shown on the
   * Program page's executive summary — not required, and not shown at
   * all for projects that don't have one. */
  note?: string;
}

/** A Program owns the shared timeline every one of its projects renders
 * against, and the ordered list of projects themselves. */
export interface Program {
  id: string;
  name: string;
  startMonth: string;
  months: number;
  projects: Project[];
}

const STATUS_RANK: Record<PhaseStatus, number> = {
  at_risk: 3,
  in_progress: 2,
  not_started: 1,
  done: 0,
};

/** "Worst" (least-done) status among a group — same "in-progress/at-risk
 * outranks done" idea as a collapsed lane's own aggregate bar in
 * PoapRenderer. Exported since the recursive swimline canvas needs it for
 * every level's own aggregate bars, not just this file's. */
export function worstStatus(phases: Phase[]): PhaseStatus {
  let status = phases[0]!.status;
  for (const p of phases) if (STATUS_RANK[p.status] > STATUS_RANK[status]) status = p.status;
  return status;
}

/**
 * A project's own single "how's it doing" status — the worst status among
 * every phase in every one of its team lanes. This is what the Program
 * page's executive summary strip groups projects by; a project with no
 * phases at all reads as "not_started" rather than crashing on an empty
 * worstStatus lookup.
 */
export function projectOverallStatus(project: Project): PhaseStatus {
  const phases = project.lanes.flatMap((l) => l.phases);
  return phases.length === 0 ? "not_started" : worstStatus(phases);
}

/**
 * Every phase across every one of a project's team lanes, flattened —
 * deriveProgramLanes' fallback for the rare project that doesn't have a
 * plan lane at all yet (older/imported data), so the portfolio view still
 * has something to render for it.
 */
export function deriveProjectSummary(project: Project): Phase[] {
  return project.lanes.flatMap((l) => l.phases);
}

/**
 * Turns one team lane's flat phase list into one synthetic Lane per Plan
 * (each holding that Plan's own real phases, packed exactly like any other
 * lane) — the same "reinterpret Lane as a different level" trick
 * deriveProgramLanes uses for Proyecto-as-lane, one level further down.
 * Any phase whose planId doesn't match a real Plan (never assigned, or its
 * Plan got deleted) still shows up, grouped under `unassignedLabel`, rather
 * than silently disappearing — same "never hide an orphan" rule as
 * findUnassignedPlanIssues below.
 */
export function groupPhasesByPlan(lane: Lane, plans: Plan[], unassignedLabel: string): Lane[] {
  const byPlan = new Map<string, Phase[]>();
  for (const phase of lane.phases) {
    const key = phase.planId && plans.some((p) => p.id === phase.planId) ? phase.planId : UNASSIGNED_PLAN_ID;
    const group = byPlan.get(key) ?? [];
    group.push(phase);
    byPlan.set(key, group);
  }
  const planLanes: Lane[] = [...plans]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((plan) => ({ id: plan.id, name: plan.name, sortOrder: plan.sortOrder, phases: byPlan.get(plan.id) ?? [] }));
  const unassigned = byPlan.get(UNASSIGNED_PLAN_ID) ?? [];
  if (unassigned.length > 0) {
    planLanes.push({ id: UNASSIGNED_PLAN_ID, name: unassignedLabel, sortOrder: plans.length, phases: unassigned });
  }
  return planLanes;
}

/**
 * One aggregate bar per Plan that actually has phases — an Equipo's own
 * "team overview" row in the recursive swimline canvas (see the anchor
 * lane built from this in project/[projectId]/page.tsx's canvasLanes),
 * complementary to groupPhasesByPlan's per-Plan rows below it: this is the
 * summary, those are the real detail. Plan-less/unassigned phases don't
 * contribute a bar here — they still exist (see groupPhasesByPlan's
 * "__unassigned__" bucket) but an aggregate bar for "no plan" wouldn't mean
 * anything at this altitude.
 */
export function derivePlanAggregateBars(lane: Lane, plans: Plan[]): Phase[] {
  const byPlan = new Map<string, Phase[]>();
  for (const phase of lane.phases) {
    if (!phase.planId) continue;
    const group = byPlan.get(phase.planId) ?? [];
    group.push(phase);
    byPlan.set(phase.planId, group);
  }
  return [...plans]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter((plan) => byPlan.has(plan.id))
    .map((plan) => {
      const phases = byPlan.get(plan.id)!;
      return {
        id: plan.id,
        title: plan.name,
        start: Math.min(...phases.map((p) => p.start)),
        end: Math.max(...phases.map((p) => p.end)),
        status: worstStatus(phases),
      };
    });
}

export interface UnassignedPlanIssue {
  laneId: string;
  laneName: string;
  phaseId: string;
  phaseTitle: string;
}

/** Every team-lane phase whose planId doesn't resolve to a real Plan of
 * that lane — never assigned, or its Plan got deleted since. Recomputed
 * live from whatever's currently true, not stored, so a fix clears itself
 * the moment the data agrees again. */
export function findUnassignedPlanIssues(lanes: Lane[], plansByLane: Record<string, Plan[]>): UnassignedPlanIssue[] {
  const issues: UnassignedPlanIssue[] = [];
  for (const lane of lanes) {
    if (lane.isProjectPlan) continue;
    const plans = plansByLane[lane.id] ?? [];
    for (const phase of lane.phases) {
      if (!phase.planId || !plans.some((p) => p.id === phase.planId)) {
        issues.push({ laneId: lane.id, laneName: lane.name, phaseId: phase.id, phaseTitle: phase.title });
      }
    }
  }
  return issues;
}

/**
 * Turns a Program's projects into one Lane per project — the portfolio
 * (Program-level) calendar is just another instance of the same
 * PoapRenderer used for a single project's detail view, with "lane"
 * reinterpreted as "project" instead of "team". Takes the project list
 * directly (not a whole Program) so callers can pass a live, possibly-
 * just-edited list (e.g. from ProjectsProvider) without needing a full
 * Program object to wrap it in.
 *
 * A project's row shows its own plan lane's real phases directly — the
 * exact same tracks its own Gantt-click detail panel shows, so the two
 * never disagree about what "this project's tracks" even means. Only
 * falls back to deriveProjectSummary's team-lane category aggregate for
 * the rare project that doesn't have a plan lane at all yet (older/
 * imported data — everything the canvas's own "+" button creates always
 * has one, see Lane.isProjectPlan).
 */
export function deriveProgramLanes(projects: Project[]): Lane[] {
  return [...projects]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((project) => {
      const planLane = project.lanes.find((l) => l.isProjectPlan);
      return {
        id: project.id,
        name: project.name,
        sortOrder: project.sortOrder,
        phases: planLane ? planLane.phases : deriveProjectSummary(project),
      };
    });
}

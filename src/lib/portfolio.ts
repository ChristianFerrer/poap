import type { Gate, Lane, Phase, PhaseStatus } from "@/components/poap-renderer/types";
import { STAGE_CATEGORIES, STAGE_CATEGORY_LABELS, type Locale, type StageCategory } from "./i18n";

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
 * PoapRenderer, just re-derived here since that one isn't exported. */
function worstStatus(phases: Phase[]): PhaseStatus {
  let status = phases[0]!.status;
  for (const p of phases) if (STATUS_RANK[p.status] > STATUS_RANK[status]) status = p.status;
  return status;
}

/**
 * One aggregated bar per stage category actually tagged somewhere in the
 * project's team lanes (see Phase.category) — its span covers every
 * tagged phase in that category across every team, so "UAT" on the
 * portfolio view always matches whatever the teams themselves entered as
 * their own UAT phases, with nobody maintaining a second copy by hand.
 * Untagged phases don't contribute to anything here; a project with no
 * tagged phases at all simply gets no summary bars rather than a
 * placeholder one.
 */
export function deriveProjectSummary(project: Project, locale: Locale): Phase[] {
  const byCategory = new Map<string, Phase[]>();
  for (const lane of project.lanes) {
    for (const phase of lane.phases) {
      if (!phase.category) continue;
      const group = byCategory.get(phase.category) ?? [];
      group.push(phase);
      byCategory.set(phase.category, group);
    }
  }

  const labels = STAGE_CATEGORY_LABELS[locale];
  return STAGE_CATEGORIES.filter((cat) => byCategory.has(cat)).map((cat) => {
    const phases = byCategory.get(cat)!;
    return {
      id: `${project.id}-${cat}`,
      title: labels[cat as StageCategory] ?? cat,
      start: Math.min(...phases.map((p) => p.start)),
      end: Math.max(...phases.map((p) => p.end)),
      status: worstStatus(phases),
      category: cat,
    };
  });
}

/**
 * Turns a Program's projects into one Lane per project — the portfolio
 * (Program-level) calendar is just another instance of the same
 * PoapRenderer used for a single project's detail view, with "lane"
 * reinterpreted as "project" instead of "team" and its phases coming from
 * deriveProjectSummary instead of being authored directly. Takes the
 * project list directly (not a whole Program) so callers can pass a live,
 * possibly-just-edited list (e.g. from ProjectsProvider) without needing
 * a full Program object to wrap it in.
 */
export function deriveProgramLanes(projects: Project[], locale: Locale): Lane[] {
  return [...projects]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((project) => ({
      id: project.id,
      name: project.name,
      sortOrder: project.sortOrder,
      phases: deriveProjectSummary(project, locale),
    }));
}

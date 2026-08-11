"use client";

import { useState } from "react";
import type { Lane, Phase } from "@/components/poap-renderer/types";
import type { Project } from "@/lib/portfolio";
import { activitiesFor, type ActivitySeed } from "./mock-data";
import { useProjects } from "./ProjectsProvider";
import { useLanguage } from "./i18n/LanguageProvider";
import type { ExplorerView } from "./ExplorerPanel";

/**
 * Every add/edit/delete operation on one project's swimlines (team lanes,
 * their phases, and each phase's activities), plus the drill-down state
 * ExplorerPanel needs — extracted out of the project detail page so the
 * Program page's Gantt-button shortcut (see page.tsx) can open the exact
 * same editing surface for a project without duplicating this logic or
 * navigating away from the portfolio view. Each caller still owns its own
 * panel orchestration (which panel is open, side-panel reveal/scroll) —
 * this hook only owns what "editing this project's swimlines" means.
 */
export function useProjectSwimlines(project: Project, initialView: ExplorerView | null = null) {
  const { t } = useLanguage();
  const { activitiesByPhase, updatePhaseActivities, setProjectLanes, announceUndo } = useProjects();
  const [explorer, setExplorer] = useState<ExplorerView | null>(initialView);

  const lanes = project.lanes;

  function getActivities(phase: Phase): ActivitySeed[] {
    return activitiesByPhase[phase.id] ?? activitiesFor(phase);
  }

  function addLane(name: string) {
    setProjectLanes(project.id, (prev) => [...prev, { id: crypto.randomUUID(), name, sortOrder: prev.length, phases: [] }]);
  }

  function renameLane(laneId: string, name: string) {
    setProjectLanes(project.id, (prev) => prev.map((lane) => (lane.id === laneId ? { ...lane, name } : lane)));
  }

  // The canvas's own "+" button (replacing the old collapse chevron, see
  // PoapRenderer) — inserts a fresh, still-unnamed lane right after
  // `afterLaneId` among the *team* lanes, whether that's the isProjectPlan
  // anchor lane itself (the new lane becomes the first team lane) or a
  // regular one. Every team lane's sortOrder gets recomputed from its new
  // position rather than trying to slot a fractional value in between —
  // same "just renumber everything" approach reorderLanes below uses.
  function addLaneBelow(afterLaneId: string) {
    setProjectLanes(project.id, (prev) => {
      const planLane = prev.find((l) => l.isProjectPlan);
      const teamLanes = prev.filter((l) => !l.isProjectPlan);
      const newLane: Lane = { id: crypto.randomUUID(), name: t.explorer.newLaneName, sortOrder: 0, phases: [] };
      const insertAt = afterLaneId === planLane?.id ? 0 : teamLanes.findIndex((l) => l.id === afterLaneId) + 1;
      const nextTeamLanes = [...teamLanes];
      nextTeamLanes.splice(insertAt, 0, newLane);
      return [...(planLane ? [planLane] : []), ...nextTeamLanes.map((l, i) => ({ ...l, sortOrder: i }))];
    });
  }

  // Drag-and-drop reordering (see PoapRenderer's onReorderLanes) — only
  // ever touches team lanes; the isProjectPlan anchor lane isn't
  // draggable, so it's simply absent from `orderedLaneIds` and its own
  // sortOrder is left exactly as it was.
  function reorderLanes(orderedLaneIds: string[]) {
    setProjectLanes(project.id, (prev) => {
      const orderIndex = new Map(orderedLaneIds.map((id, i) => [id, i]));
      return prev.map((lane) => (orderIndex.has(lane.id) ? { ...lane, sortOrder: orderIndex.get(lane.id)! } : lane));
    });
  }

  function updatePhase(laneId: string, phaseId: string, patch: Partial<Pick<Phase, "title" | "start" | "end" | "status" | "planId">>) {
    setProjectLanes(project.id, (prev) =>
      prev.map((lane) =>
        lane.id !== laneId
          ? lane
          : { ...lane, phases: lane.phases.map((p) => (p.id === phaseId ? { ...p, ...patch } : p)) },
      ),
    );
  }

  function addPhase(laneId: string, phase: Phase) {
    setProjectLanes(project.id, (prev) => prev.map((lane) => (lane.id === laneId ? { ...lane, phases: [...lane.phases, phase] } : lane)));
  }

  function deleteLane(laneId: string) {
    const index = lanes.findIndex((l) => l.id === laneId);
    if (index === -1) return;
    const lane = lanes[index]!;
    const deletedPhaseIds = new Set(lane.phases.map((p) => p.id));
    const removedActivities: Record<string, ActivitySeed[]> = {};
    for (const phaseId of deletedPhaseIds) {
      if (phaseId in activitiesByPhase) removedActivities[phaseId] = activitiesByPhase[phaseId]!;
    }
    setProjectLanes(project.id, (prev) => prev.filter((l) => l.id !== laneId));
    for (const phaseId of Object.keys(removedActivities)) {
      updatePhaseActivities(phaseId, () => []);
    }
    setExplorer((prev) => {
      if (!prev || prev.level === "lanes") return prev;
      if (prev.level === "phases") return prev.laneId === laneId ? { level: "lanes" } : prev;
      const wasUnderDeletedLane = lane.phases.some((p) => p.id === prev.phaseId);
      return wasUnderDeletedLane ? { level: "lanes" } : prev;
    });
    announceUndo(t.undo.laneDeleted(lane.name), () => {
      setProjectLanes(project.id, (prev) => {
        const next = [...prev];
        next.splice(index, 0, lane);
        return next;
      });
      for (const [phaseId, activities] of Object.entries(removedActivities)) {
        updatePhaseActivities(phaseId, () => activities);
      }
    });
  }

  function deletePhase(laneId: string, phaseId: string) {
    const lane = lanes.find((l) => l.id === laneId);
    const phaseIndex = lane?.phases.findIndex((p) => p.id === phaseId) ?? -1;
    if (!lane || phaseIndex === -1) return;
    const phase = lane.phases[phaseIndex]!;
    const removedActivities = activitiesByPhase[phaseId];
    setProjectLanes(project.id, (prev) =>
      prev.map((l) => (l.id === laneId ? { ...l, phases: l.phases.filter((p) => p.id !== phaseId) } : l)),
    );
    if (removedActivities) updatePhaseActivities(phaseId, () => []);
    setExplorer((prev) => {
      if (!prev || prev.level === "lanes" || prev.level === "phases") return prev;
      return prev.phaseId === phaseId ? { level: "phases", laneId } : prev;
    });
    announceUndo(t.undo.phaseDeleted(phase.title), () => {
      setProjectLanes(project.id, (prev) =>
        prev.map((l) => {
          if (l.id !== laneId) return l;
          const nextPhases = [...l.phases];
          nextPhases.splice(phaseIndex, 0, phase);
          return { ...l, phases: nextPhases };
        }),
      );
      if (removedActivities) updatePhaseActivities(phaseId, () => removedActivities);
    });
  }

  function addActivity(phase: Phase, activity: ActivitySeed) {
    updatePhaseActivities(phase.id, (prev) => [...(prev ?? activitiesFor(phase)), activity]);
  }

  function deleteActivity(phase: Phase, activityId: string) {
    const activities = getActivities(phase);
    const index = activities.findIndex((a) => a.id === activityId);
    if (index === -1) return;
    const removed = activities[index]!;
    updatePhaseActivities(phase.id, () => activities.filter((a) => a.id !== activityId));
    setExplorer((prev) =>
      prev && prev.level === "activity" && prev.activityId === activityId ? { level: "activities", phaseId: phase.id } : prev,
    );
    announceUndo(t.undo.activityDeleted(removed.title), () => {
      updatePhaseActivities(phase.id, (prev) => {
        const current = prev ?? activitiesFor(phase);
        const next = [...current];
        next.splice(index, 0, removed);
        return next;
      });
    });
  }

  return {
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
  };
}

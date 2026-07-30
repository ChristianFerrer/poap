"use client";

import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { Gate, Lane } from "@/components/poap-renderer/types";
import type { Project, StageCategoryDef } from "@/lib/portfolio";
import { STAGE_CATEGORIES, STAGE_CATEGORY_LABELS } from "@/lib/i18n";
import { ACTIVITIES_BY_PHASE, PROJECTS as SEED_PROJECTS, type ActivitySeed } from "./mock-data";

const SEED_STAGE_CATEGORIES: StageCategoryDef[] = STAGE_CATEGORIES.map((id) => ({
  id,
  label: STAGE_CATEGORY_LABELS.es[id],
}));

interface ProjectsContextValue {
  projects: Project[];
  /** Creates a project and returns its new id (synchronously — computed
   * off the current `projects` closure, not read back out of the setState
   * updater, so the caller can navigate to it immediately). */
  addProject: (input: { name: string; lanes: Lane[]; gates: Gate[] }) => string;
  deleteProject: (projectId: string) => void;
  setProjectLanes: (projectId: string, updater: (lanes: Lane[]) => Lane[]) => void;
  setProjectGates: (projectId: string, updater: (gates: Gate[]) => Gate[]) => void;
  activitiesByPhase: Record<string, ActivitySeed[]>;
  setActivitiesByPhase: Dispatch<SetStateAction<Record<string, ActivitySeed[]>>>;
  /** The live, user-editable stage lifecycle (Settings → Fases de
   * proyecto) — what AddProjectPanel and ExplorerPanel's category picker
   * offer, and what deriveProjectSummary aggregates by. Seeded from the
   * original 9-stage list but freely renameable/extendable/deletable from
   * here on; a Phase only ever stores a category *id*, so renaming one
   * updates every phase's displayed stage for free. */
  stageCategories: StageCategoryDef[];
  addStageCategory: (label: string) => void;
  renameStageCategory: (id: string, label: string) => void;
  deleteStageCategory: (id: string) => void;
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
 * Holds every project's lanes/gates (and the activities nested under their
 * phases) as one shared client-side store, rooted above both the Program
 * page and every Project page in layout.tsx — a plain module-level
 * constant wouldn't survive across pages the way this does, since each
 * page is its own component tree that fully mounts/unmounts on
 * navigation, but the root layout (and anything it renders above the
 * routed page) does not. Still no real backend: everything here resets on
 * a hard reload, same trade-off the app already had — this only fixes the
 * narrower problem of a *client-side navigation* (Program → a project and
 * back, or project → project) losing state it didn't need to.
 */
export function ProjectsProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>(SEED_PROJECTS);
  const [activitiesByPhase, setActivitiesByPhase] = useState<Record<string, ActivitySeed[]>>(ACTIVITIES_BY_PHASE);
  const [stageCategories, setStageCategories] = useState<StageCategoryDef[]>(SEED_STAGE_CATEGORIES);

  function addProject(input: { name: string; lanes: Lane[]; gates: Gate[] }): string {
    const base = slugify(input.name);
    const existingIds = new Set(projects.map((p) => p.id));
    let id = base;
    let suffix = 2;
    while (existingIds.has(id)) {
      id = `${base}-${suffix}`;
      suffix += 1;
    }
    setProjects((prev) => [...prev, { id, name: input.name, sortOrder: prev.length, lanes: input.lanes, gates: input.gates }]);
    return id;
  }

  function deleteProject(projectId: string) {
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
  }

  function setProjectLanes(projectId: string, updater: (lanes: Lane[]) => Lane[]) {
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, lanes: updater(p.lanes) } : p)));
  }

  function setProjectGates(projectId: string, updater: (gates: Gate[]) => Gate[]) {
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, gates: updater(p.gates) } : p)));
  }

  function addStageCategory(label: string) {
    const trimmed = label.trim();
    if (!trimmed) return;
    setStageCategories((prev) => [...prev, { id: crypto.randomUUID(), label: trimmed }]);
  }

  function renameStageCategory(id: string, label: string) {
    setStageCategories((prev) => prev.map((c) => (c.id === id ? { ...c, label } : c)));
  }

  function deleteStageCategory(id: string) {
    setStageCategories((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <ProjectsContext.Provider
      value={{
        projects,
        addProject,
        deleteProject,
        setProjectLanes,
        setProjectGates,
        activitiesByPhase,
        setActivitiesByPhase,
        stageCategories,
        addStageCategory,
        renameStageCategory,
        deleteStageCategory,
      }}
    >
      {children}
    </ProjectsContext.Provider>
  );
}

export function useProjects(): ProjectsContextValue {
  const ctx = useContext(ProjectsContext);
  if (!ctx) throw new Error("useProjects must be used within a ProjectsProvider");
  return ctx;
}

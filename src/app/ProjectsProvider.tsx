"use client";

import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { Gate, Lane } from "@/components/poap-renderer/types";
import type { Project } from "@/lib/portfolio";
import { ACTIVITIES_BY_PHASE, PROJECTS as SEED_PROJECTS, type ActivitySeed } from "./mock-data";

interface ProjectsContextValue {
  projects: Project[];
  /** Creates a project and returns its new id (synchronously — computed
   * off the current `projects` closure, not read back out of the setState
   * updater, so the caller can navigate to it immediately). */
  addProject: (input: { name: string; lanes: Lane[]; gates: Gate[] }) => string;
  setProjectLanes: (projectId: string, updater: (lanes: Lane[]) => Lane[]) => void;
  setProjectGates: (projectId: string, updater: (gates: Gate[]) => Gate[]) => void;
  activitiesByPhase: Record<string, ActivitySeed[]>;
  setActivitiesByPhase: Dispatch<SetStateAction<Record<string, ActivitySeed[]>>>;
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

  function setProjectLanes(projectId: string, updater: (lanes: Lane[]) => Lane[]) {
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, lanes: updater(p.lanes) } : p)));
  }

  function setProjectGates(projectId: string, updater: (gates: Gate[]) => Gate[]) {
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, gates: updater(p.gates) } : p)));
  }

  return (
    <ProjectsContext.Provider
      value={{ projects, addProject, setProjectLanes, setProjectGates, activitiesByPhase, setActivitiesByPhase }}
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

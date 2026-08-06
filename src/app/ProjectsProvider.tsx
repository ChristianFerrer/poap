"use client";

import { createContext, useContext, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { Gate, Lane } from "@/components/poap-renderer/types";
import type { Project, StageCategoryDef } from "@/lib/portfolio";
import { STAGE_CATEGORIES, STAGE_CATEGORY_LABELS } from "@/lib/i18n";
import { ACTIVITIES_BY_PHASE, PROJECTS as SEED_PROJECTS, type ActivityComment, type ActivitySeed } from "./mock-data";
import { useLanguage } from "./i18n/LanguageProvider";
import { UndoToast } from "./UndoToast";

const SEED_STAGE_CATEGORIES: StageCategoryDef[] = STAGE_CATEGORIES.map((id) => ({
  id,
  label: STAGE_CATEGORY_LABELS.es[id],
}));

// How long an undo stays offered before a delete becomes final.
const UNDO_WINDOW_MS = 6000;

export interface PendingUndo {
  message: string;
  undo: () => void;
}

interface ProjectsContextValue {
  projects: Project[];
  /** Creates a project and returns its new id (synchronously — computed
   * off the current `projects` closure, not read back out of the setState
   * updater, so the caller can navigate to it immediately). */
  addProject: (input: { name: string; lanes: Lane[]; gates: Gate[] }) => string;
  deleteProject: (projectId: string) => void;
  setProjectLanes: (projectId: string, updater: (lanes: Lane[]) => Lane[]) => void;
  setProjectGates: (projectId: string, updater: (gates: Gate[]) => Gate[]) => void;
  /** Short freeform status note surfaced on the Program page's executive
   * summary for projects that need one — not a project field teams edit
   * day to day, just the "why" a PMO/sponsor asks for without opening the
   * project. */
  setProjectNote: (projectId: string, note: string) => void;
  activitiesByPhase: Record<string, ActivitySeed[]>;
  setActivitiesByPhase: Dispatch<SetStateAction<Record<string, ActivitySeed[]>>>;
  commentsByActivity: Record<string, ActivityComment[]>;
  setCommentsByActivity: Dispatch<SetStateAction<Record<string, ActivityComment[]>>>;
  addComment: (activityId: string, text: string) => void;
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
 * routed page) does not. Still no real backend: everything here resets on
 * a hard reload, same trade-off the app already had — this only fixes the
 * narrower problem of a *client-side navigation or panel close* losing
 * state it didn't need to (activity comments used to live in
 * ExplorerPanel's own local state and vanished the moment its panel
 * closed, not just on reload — that was a real bug, not the documented
 * trade-off).
 */
export function ProjectsProvider({ children }: { children: ReactNode }) {
  const { t } = useLanguage();
  const [projects, setProjects] = useState<Project[]>(SEED_PROJECTS);
  const [activitiesByPhase, setActivitiesByPhase] = useState<Record<string, ActivitySeed[]>>(ACTIVITIES_BY_PHASE);
  const [commentsByActivity, setCommentsByActivity] = useState<Record<string, ActivityComment[]>>({});
  const [stageCategories, setStageCategories] = useState<StageCategoryDef[]>(SEED_STAGE_CATEGORIES);
  const [pendingUndo, setPendingUndo] = useState<PendingUndo | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    const index = projects.findIndex((p) => p.id === projectId);
    if (index === -1) return;
    const removed = projects[index]!;
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    announceUndo(t.undo.projectDeleted(removed.name), () => {
      setProjects((prev) => {
        const next = [...prev];
        next.splice(index, 0, removed);
        return next;
      });
    });
  }

  function setProjectLanes(projectId: string, updater: (lanes: Lane[]) => Lane[]) {
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, lanes: updater(p.lanes) } : p)));
  }

  function setProjectGates(projectId: string, updater: (gates: Gate[]) => Gate[]) {
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, gates: updater(p.gates) } : p)));
  }

  function setProjectNote(projectId: string, note: string) {
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, note } : p)));
  }

  function addComment(activityId: string, text: string) {
    setCommentsByActivity((prev) => ({
      ...prev,
      [activityId]: [...(prev[activityId] ?? []), { author: t.explorer.commentAuthorYou, date: t.explorer.commentDateJustNow, text }],
    }));
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
    const index = stageCategories.findIndex((c) => c.id === id);
    if (index === -1) return;
    const removed = stageCategories[index]!;
    setStageCategories((prev) => prev.filter((c) => c.id !== id));
    announceUndo(t.undo.stageDeleted(removed.label), () => {
      setStageCategories((prev) => {
        const next = [...prev];
        next.splice(index, 0, removed);
        return next;
      });
    });
  }

  return (
    <ProjectsContext.Provider
      value={{
        projects,
        addProject,
        deleteProject,
        setProjectLanes,
        setProjectGates,
        setProjectNote,
        activitiesByPhase,
        setActivitiesByPhase,
        commentsByActivity,
        setCommentsByActivity,
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
    </ProjectsContext.Provider>
  );
}

export function useProjects(): ProjectsContextValue {
  const ctx = useContext(ProjectsContext);
  if (!ctx) throw new Error("useProjects must be used within a ProjectsProvider");
  return ctx;
}

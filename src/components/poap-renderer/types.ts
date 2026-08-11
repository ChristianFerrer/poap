export type PhaseStatus = "done" | "in_progress" | "at_risk" | "not_started";

/** A single phase bar. start/end are decimal-month positions on the axis (see toAxis). */
export interface Phase {
  id: string;
  title: string;
  start: number;
  end: number;
  status: PhaseStatus;
  subLane?: string | null;
  /** Teams/people involved — shown in the hover popup, not on the bar itself. */
  owners?: string[];
  /** Which stage this phase belongs to (see StageCategory in src/lib/i18n)
   * — purely an app-level tag the renderer never reads itself, used to
   * derive a project's portfolio-level summary bars from its teams' own
   * phases. Untagged phases (undefined) just don't count toward any
   * stage's aggregate span. */
  category?: string;
  /** Which of its team lane's Planes this phase belongs to (see the Plan
   * type in src/lib/portfolio.ts) — another app-level grouping tag the
   * renderer never reads, same shape as `category` but one level down the
   * hierarchy (Equipo -> Plan -> Fase, vs. category's Proyecto -> Fase).
   * Undefined for the isProjectPlan anchor lane's own phases, which don't
   * have Planes of their own. */
  planId?: string;
  /** Marks a bar the renderer itself should flag (amber fill + a warning
   * glyph) instead of its normal status color — unlike category/planId,
   * this one IS read by the renderer, since it's about how the bar looks,
   * not what it means app-side. Currently only set by deriveProjectSummary
   * for a project-summary phase missing its stage-category tag, so an
   * Excel-imported project reads as "real work, needs a category" on the
   * Program page instead of either vanishing or blending in with tagged
   * work. */
  warning?: boolean;
}

export interface Lane {
  id: string;
  name: string;
  sortOrder: number;
  phases: Phase[];
  /** Marks the one lane per project that holds its high-level, cross-team
   * plan (Design/Build/SIT/UAT/…, tagged with the same stage categories
   * team lanes use) rather than a specific team's own work. The renderer
   * pins it above every other lane and above the Stage gates row, and
   * gives it a distinct accent — see PoapRenderer's plan-lane handling —
   * so it always reads as "the plan", not just another team. */
  isProjectPlan?: boolean;
}

export interface Gate {
  id: string;
  label: string;
  position: number;
}

export interface Band {
  id: string;
  label: string;
  start: number;
  end: number;
  type: string;
}

export interface PoapRendererProps {
  months: number;
  startMonth: string; // ISO 'YYYY-MM'
  /** Which language the renderer's own literal strings (zoom labels,
   * tooltips, "Hoy"/"Today", month abbreviations, ...) render in. Just
   * another data-in prop, same as `months` — the renderer never reaches
   * into app-level state/context to decide this itself. Defaults to "es"
   * to match this app's original, pre-i18n behavior. */
  locale?: import("@/lib/i18n").Locale;
  lanes: Lane[];
  gates?: Gate[];
  bands?: Band[];
  selectedPhaseId?: string | null;
  onPhaseClick?: (phaseId: string) => void;
  /** Which gates currently show their purple cut-line — controlled by the
   * parent (like selectedPhaseId) rather than internal state, since a real
   * app needs this to survive a gates-management panel living outside the
   * renderer. */
  activeGateIds?: string[];
  onGateClick?: (gateId: string) => void;
  /** Clicking a lane's name (not its collapse chevron) — lets the app open
   * a management view for that lane without the renderer knowing what
   * "managing a lane" means. */
  onLaneClick?: (laneId: string) => void;
  /** Dragging across empty space in an expanded lane's track — the
   * renderer only reports the lane and the dragged axis range, exactly
   * like a manually-typed date range would; it has no opinion on what
   * "creating a track" involves beyond that (title, category, ...). Omit
   * to leave the track non-interactive for creation (e.g. the read-only
   * Program-level portfolio view). */
  onCreatePhase?: (laneId: string, start: number, end: number) => void;
  /** Restricts which lanes onCreatePhase actually applies to — e.g. the
   * project page shows team lanes and the isProjectPlan anchor lane side
   * by side, but only the anchor lane's tracks are allowed to exist
   * without belonging to a Plan, so team lanes there aren't creatable at
   * all (see the app-level Plan requirement). Omit (with onCreatePhase
   * set) to allow creation on every lane, e.g. a page that's already
   * scoped to exactly one creatable lane. */
  isLaneCreatable?: (laneId: string) => boolean;
  /** A second, explicit per-lane action distinct from onLaneClick — e.g.
   * the Program page uses this for a "view swimlines" shortcut on each
   * project row, while onLaneClick itself still navigates into the
   * project. Renders nothing when omitted. */
  onLaneGanttClick?: (laneId: string) => void;
  /** Which lane's Gantt shortcut is the one currently driving an open
   * panel elsewhere in the app — the renderer has no idea what a "panel"
   * is, it just paints that one lane's Gantt button in its pressed/active
   * look instead of the resting one, for as long as the caller says so
   * (until the panel closes, or the lane itself gets deleted/canceled out
   * from under it). Matched purely by id against whatever `lanes` this
   * render pass got, so it stays correct across every drill level without
   * the renderer needing to know which level it's currently showing. */
  activeGanttLaneId?: string | null;
  /** Clicking the "Stage gates" row label itself (not a specific gate
   * diamond) — same idea as onLaneClick, opens whatever management view
   * the app has for gates in general rather than one gate in particular. */
  onGatesLabelClick?: () => void;
  /** Deletes a whole lane — a small trash button in its label row (never
   * shown on the isProjectPlan anchor lane, which isn't deletable this
   * way). The renderer itself only asks "are you sure?" inline before
   * calling this; it has no idea what deleting a lane cascades into
   * (phases, activities, ...) — that's the caller's own mutation. Omit to
   * leave lanes non-deletable from the canvas. */
  /** Excludes specific non-anchor lanes from delete/drag without the
   * renderer needing to know why — e.g. a synthetic "ungrouped" bucket
   * lane that isn't a real, orderable record on the app side. Reorder's
   * add-below button still renders (creating something *after* the bucket
   * is meaningful); this only gates the two actions that assume the lane
   * itself is a real, deletable/reorderable record. Omit to make every
   * non-anchor lane manageable, same as before this prop existed. */
  isLaneManageable?: (laneId: string) => boolean;
  onDeleteLane?: (laneId: string) => void;
  /** Creates a new lane immediately after `afterLaneId` — the button that
   * replaced the old collapse/expand chevron at the head of every lane's
   * row, including the anchor lane (whose "+" adds the first *regular*
   * lane right below it). The renderer has no opinion on the new lane's
   * name; the caller seeds a default and the user renames it same as any
   * other lane. Omit to leave that button unrendered. */
  onAddLaneBelow?: (afterLaneId: string) => void;
  /** Fires once, on drop, with every *non-anchor* lane's id in its new
   * order — the isProjectPlan anchor lane is never draggable and never
   * appears in this list, so a caller can just remap sortOrder by index.
   * Omit to leave lanes non-draggable. */
  onReorderLanes?: (orderedLaneIds: string[]) => void;
  /** Whether Saturday/Sunday columns get a tinted background across the
   * whole calendar body. Purely visual — defaults on. */
  showWeekends?: boolean;
  /** Whether the current-day marker (line + "Hoy"/"Today" badge) renders
   * at all. Defaults on. */
  showToday?: boolean;
}

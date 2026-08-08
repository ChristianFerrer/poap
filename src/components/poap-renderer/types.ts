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
}

export interface Lane {
  id: string;
  name: string;
  sortOrder: number;
  phases: Phase[];
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
  /** A second, explicit per-lane action distinct from onLaneClick — e.g.
   * the Program page uses this for a "view swimlines" shortcut on each
   * project row, while onLaneClick itself still navigates into the
   * project. Renders nothing when omitted. */
  onLaneGanttClick?: (laneId: string) => void;
  /** Clicking the "Stage gates" row label itself (not a specific gate
   * diamond) — same idea as onLaneClick, opens whatever management view
   * the app has for gates in general rather than one gate in particular. */
  onGatesLabelClick?: () => void;
  /** Whether Saturday/Sunday columns get a tinted background across the
   * whole calendar body. Purely visual — defaults on. */
  showWeekends?: boolean;
  /** Whether the current-day marker (line + "Hoy"/"Today" badge) renders
   * at all. Defaults on. */
  showToday?: boolean;
}

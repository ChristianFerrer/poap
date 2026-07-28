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
}

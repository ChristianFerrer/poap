"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent } from "react";
import { packLane } from "./pack";
import { fromAxis, toAxis } from "./toAxis";
import type { Gate, Lane, Phase, PhaseStatus, PoapRendererProps } from "./types";
import {
  DAY_INITIALS,
  DEFAULT_LOCALE,
  MONTH_ABBR,
  RENDERER_STRINGS,
  STATUS_LABELS,
  ZOOM_LABELS,
  pluralForm,
  type Locale,
} from "@/lib/i18n";
import {
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconGantt,
  IconGrip,
  IconMinus,
  IconPinOff,
  IconPlus,
  IconTrash,
} from "@/lib/icons";
import {
  BADGE_STRIP_HEIGHT,
  BAR_HEIGHT,
  BAR_MIN_TEXT_PX,
  GATES_ROW_BASE_HEIGHT,
  GATE_COLLISION_PX,
  GATE_SHIFT_PX,
  LABEL_COL_WIDTH,
  LANE_PADDING_Y,
  MIN_LANE_ROW_HEIGHT,
  MONTH_ROW_HEIGHT,
  ROW_GAP,
  SUB_ROW_HEIGHT,
  YEAR_ROW_HEIGHT,
  ZOOM_LEVELS,
  ZOOM_SCALE_DEFAULT,
  ZOOM_SCALE_MAX,
  ZOOM_SCALE_MIN,
  ZOOM_SCALE_STEP,
  type SubRowGranularity,
  type ZoomLevel,
} from "./constants";
import styles from "./PoapRenderer.module.css";

const STATUS_CLASS: Record<PhaseStatus, string> = {
  done: styles.statusDone!,
  in_progress: styles.statusInProgress!,
  at_risk: styles.statusAtRisk!,
  not_started: styles.statusNotStarted!,
};

interface DayScale {
  /** Cumulative real days from range start to each month boundary — length
   * months+1, offsets[i] = real days elapsed before month i starts. */
  offsets: number[];
  totalDays: number;
}

/**
 * The axis unit ("decimal month") gives every calendar month equal *axis*
 * width by design (Phase.start/end contract) — but months don't have equal
 * *real* width (28-31 days), so rendering position/width directly from axis
 * deltas made a week in a 31-day month visibly narrower than one in a
 * 28-day month, and any week straddling a month boundary came out an
 * inconsistent size entirely. DayScale converts axis positions to real
 * elapsed days first, so every calendar day gets the same pixel width
 * everywhere, matching how Excel actually laid the sheet out.
 */
function buildDayScale(startMonth: string, months: number): DayScale {
  const parts = startMonth.split("-").map(Number);
  let y = parts[0] ?? 0;
  let m = (parts[1] ?? 1) - 1;
  const offsets = [0];
  for (let i = 0; i < months; i++) {
    const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    offsets.push(offsets[offsets.length - 1]! + daysInMonth);
    m++;
    if (m === 12) {
      m = 0;
      y++;
    }
  }
  return { offsets, totalDays: offsets[offsets.length - 1]! };
}

function axisToDays(position: number, scale: DayScale): number {
  const months = scale.offsets.length - 1;
  if (position <= 0) return 0;
  if (position >= months) return scale.totalDays;
  const idx = Math.floor(position);
  const frac = position - idx;
  const monthDays = scale.offsets[idx + 1]! - scale.offsets[idx]!;
  return scale.offsets[idx]! + frac * monthDays;
}

/** Inverse of axisToDays — turns a real-day offset (e.g. from a click's
 * pixel ratio × totalDays) back into an axis position. */
function daysToAxis(days: number, scale: DayScale): number {
  let idx = scale.offsets.findIndex((o, i) => i < scale.offsets.length - 1 && days < scale.offsets[i + 1]!);
  if (idx === -1) idx = scale.offsets.length - 2;
  const monthDays = scale.offsets[idx + 1]! - scale.offsets[idx]!;
  const frac = monthDays > 0 ? (days - scale.offsets[idx]!) / monthDays : 0;
  return idx + frac;
}

/** Left-offset percentage for a single axis position. */
function pct(position: number, scale: DayScale): string {
  return `${(axisToDays(position, scale) / scale.totalDays) * 100}%`;
}

/** Width percentage between two axis positions — not the same as
 * pct(end) - pct(start) as text, needs the day-space delta directly. */
function pctSpan(start: number, end: number, scale: DayScale): string {
  return `${((axisToDays(end, scale) - axisToDays(start, scale)) / scale.totalDays) * 100}%`;
}

interface MonthSegment {
  label: string;
  startIdx: number;
}

function monthSegments(startMonth: string, months: number, monthAbbr: string[]): MonthSegment[] {
  const parts = startMonth.split("-").map(Number);
  const startMonthNum = parts[1] ?? 1;
  return Array.from({ length: months }, (_, i) => {
    const idx = (startMonthNum - 1 + i) % 12;
    return { label: monthAbbr[idx]!.toUpperCase(), startIdx: i };
  });
}

interface YearSegment {
  year: number;
  startIdx: number;
  span: number;
}

function yearSegments(startMonth: string, months: number): YearSegment[] {
  const parts = startMonth.split("-").map(Number);
  const startYear = parts[0] ?? 0;
  const startMonthNum = parts[1] ?? 1;
  const segments: YearSegment[] = [];
  for (let i = 0; i < months; i++) {
    const absoluteMonth = startMonthNum - 1 + i;
    const year = startYear + Math.floor(absoluteMonth / 12);
    const last = segments[segments.length - 1];
    if (last && last.year === year) last.span += 1;
    else segments.push({ year, startIdx: i, span: 1 });
  }
  return segments;
}

interface SubCell {
  start: number;
  end: number;
  label: number | string;
  /** Date#getUTCDay() of the cell's start day (0=Sun…6=Sat) — used to show
   * the weekday initial above the day number at the Día zoom, and to know
   * which sub-row cells fall on a weekend. Unused (0) for quarter cells. */
  dow: number;
}

/**
 * Cells for the ruler's third row — one per calendar quarter, week (a
 * 7-day bucket from the 1st of startMonth, not calendar-aligned to
 * Mondays), or calendar day, matching the grid Excel drew: divisions at
 * each cell's start/end, the label centered inside the cell rather than
 * pinned to an edge.
 */
function subCells(startMonth: string, months: number, granularity: SubRowGranularity): SubCell[] {
  if (granularity === "none") return [];
  const parts = startMonth.split("-").map(Number);
  const y = parts[0] ?? 0;
  const m = parts[1] ?? 1;
  const rangeStart = new Date(Date.UTC(y, m - 1, 1));
  const rangeEnd = new Date(Date.UTC(y, m - 1 + months, 1));

  if (granularity === "quarter") {
    // Calendar-aligned (Jan-Mar = Q1, ...), not aligned to startMonth — a
    // plan starting mid-quarter gets a shorter first cell, same idea as
    // .yearRow's own segments not all being 12 months wide.
    const cells: SubCell[] = [];
    for (let d = rangeStart; d < rangeEnd; ) {
      const quarterIndex = Math.floor(d.getUTCMonth() / 3);
      const boundary = new Date(Date.UTC(d.getUTCFullYear(), (quarterIndex + 1) * 3, 1));
      const next = boundary < rangeEnd ? boundary : rangeEnd;
      cells.push({ start: toAxis(d, startMonth), end: toAxis(next, startMonth), label: `Q${quarterIndex + 1}`, dow: 0 });
      d = next;
    }
    return cells;
  }

  const stepDays = granularity === "day" ? 1 : 7;
  const cells: SubCell[] = [];
  for (
    let d = rangeStart;
    d < rangeEnd;
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + stepDays))
  ) {
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + stepDays));
    cells.push({ start: toAxis(d, startMonth), end: toAxis(next, startMonth), label: d.getUTCDate(), dow: d.getUTCDay() });
  }
  return cells;
}

interface DayRange {
  start: number;
  end: number;
}

/** Every Saturday/Sunday in the plan's range, as axis start/end pairs —
 * used to tint weekend columns across the whole calendar body regardless
 * of zoom level (unlike subCells, which only exists at week/day
 * granularity and is Año/Mes-zoom-dependent). */
function weekendRanges(startMonth: string, months: number): DayRange[] {
  const parts = startMonth.split("-").map(Number);
  const y = parts[0] ?? 0;
  const m = parts[1] ?? 1;
  const rangeStart = new Date(Date.UTC(y, m - 1, 1));
  const rangeEnd = new Date(Date.UTC(y, m - 1 + months, 1));

  const ranges: DayRange[] = [];
  for (
    let d = rangeStart;
    d < rangeEnd;
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1))
  ) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) continue;
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
    ranges.push({ start: toAxis(d, startMonth), end: toAxis(next, startMonth) });
  }
  return ranges;
}

type ColumnUnit = "day" | "week" | "month" | "quarter";

interface ColumnRange {
  start: number;
  end: number;
}

/**
 * Excel's "Focus Cell": resolves a click's x position to the column it
 * landed on. Which unit applies depends on which ruler row was clicked —
 * the month header always resolves to a month; the sub row resolves to
 * whatever it's currently divided into (week or day) — not on the overall
 * zoom level directly, so clicking the month row at zoom "dia" still
 * highlights the whole month.
 */
function columnRange(rawPosition: number, unit: ColumnUnit, startMonth: string): ColumnRange {
  if (unit === "day") {
    const start = toAxis(fromAxis(rawPosition, startMonth), startMonth);
    const date = fromAxis(start, startMonth);
    const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));
    return { start, end: toAxis(next, startMonth) };
  }
  if (unit === "week") {
    const parts = startMonth.split("-").map(Number);
    const rangeStart = new Date(Date.UTC(parts[0] ?? 0, (parts[1] ?? 1) - 1, 1));
    const date = fromAxis(rawPosition, startMonth);
    const daysSinceStart = Math.round((date.getTime() - rangeStart.getTime()) / 86_400_000);
    const bucketIndex = Math.floor(daysSinceStart / 7);
    const bucketStart = new Date(rangeStart.getTime() + bucketIndex * 7 * 86_400_000);
    const bucketEnd = new Date(bucketStart.getTime() + 7 * 86_400_000);
    return { start: toAxis(bucketStart, startMonth), end: toAxis(bucketEnd, startMonth) };
  }
  if (unit === "quarter") {
    const date = fromAxis(rawPosition, startMonth);
    const quarterIndex = Math.floor(date.getUTCMonth() / 3);
    const qStart = new Date(Date.UTC(date.getUTCFullYear(), quarterIndex * 3, 1));
    const qEnd = new Date(Date.UTC(date.getUTCFullYear(), (quarterIndex + 1) * 3, 1));
    return { start: toAxis(qStart, startMonth), end: toAxis(qEnd, startMonth) };
  }
  // month
  const start = Math.floor(rawPosition);
  return { start, end: start + 1 };
}

function formatColumnLabel(
  range: ColumnRange,
  unit: ColumnUnit,
  startMonth: string,
  monthAbbr: string[],
  weekOfPrefix: string,
): string {
  const start = fromAxis(range.start, startMonth);
  if (unit === "day") {
    return `${start.getUTCDate()} ${monthAbbr[start.getUTCMonth()]} ${String(start.getUTCFullYear()).slice(2)}`;
  }
  if (unit === "week") {
    return `${weekOfPrefix} ${start.getUTCDate()} ${monthAbbr[start.getUTCMonth()]}`;
  }
  if (unit === "quarter") {
    return `Q${Math.floor(start.getUTCMonth() / 3) + 1} ${start.getUTCFullYear()}`;
  }
  return `${monthAbbr[start.getUTCMonth()]!.charAt(0).toUpperCase()}${monthAbbr[start.getUTCMonth()]!.slice(1)} ${start.getUTCFullYear()}`;
}

/** Monday of the calendar week containing `date` — a real Mon–Fri business
 * week, deliberately not the same "7 days from the 1st of startMonth"
 * bucketing subCells() uses for the ruler's own sub-row cells (that one
 * exists purely to keep ruler columns a consistent width; this one has to
 * match how a person actually reads "the week of"). */
function mondayOf(date: Date): Date {
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - daysSinceMonday));
}
function fridayOf(monday: Date): Date {
  return new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + 4));
}
function firstBusinessDayOfMonth(date: Date): Date {
  const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const dow = first.getUTCDay();
  if (dow === 6) return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 3));
  if (dow === 0) return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 2));
  return first;
}
function lastBusinessDayOfMonth(date: Date): Date {
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  const dow = last.getUTCDay();
  if (dow === 6) return new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate() - 1));
  if (dow === 0) return new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate() - 2));
  return last;
}

/**
 * Snaps a raw dragged (or hovered) axis range to whatever unit is actually
 * visible at the current zoom — Día stays exact (a person picking days
 * wants days), Semana snaps out to the Mon–Fri business week each end
 * falls in, Mes/Año snap out to the first/last business day of each end's
 * month. Matches how someone reads the ruler at that zoom: "I dragged from
 * the July cell to the September cell" should mean the whole of July
 * through the whole of September, not whatever fraction of those months
 * the cursor happened to land on in pixels.
 */
function snapAxisRange(rawStart: number, rawEnd: number, zoomKey: ZoomLevel["key"], startMonth: string): { start: number; end: number } {
  const s = Math.min(rawStart, rawEnd);
  const e = Math.max(rawStart, rawEnd);
  if (zoomKey === "dia") {
    return { start: toAxis(fromAxis(s, startMonth), startMonth), end: toAxis(fromAxis(e, startMonth), startMonth) };
  }
  if (zoomKey === "semana") {
    return {
      start: toAxis(mondayOf(fromAxis(s, startMonth)), startMonth),
      end: toAxis(fridayOf(mondayOf(fromAxis(e, startMonth))), startMonth),
    };
  }
  return {
    start: toAxis(firstBusinessDayOfMonth(fromAxis(s, startMonth)), startMonth),
    end: toAxis(lastBusinessDayOfMonth(fromAxis(e, startMonth)), startMonth),
  };
}

/** The full visible cell (day/week/month) a single hovered point falls
 * in — deliberately its whole natural width (Monday–Sunday, 1st–last of
 * month), not the Mon–Fri business range snapAxisRange creates a track
 * with. This one just answers "which cell is the cursor over", the same
 * question the ruler itself answers with its own column widths; the
 * business-day trim only matters once something's actually being created. */
function hoverCellRange(axis: number, zoomKey: ZoomLevel["key"], startMonth: string): { start: number; end: number } {
  const date = fromAxis(axis, startMonth);
  if (zoomKey === "dia") {
    const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));
    return { start: toAxis(date, startMonth), end: toAxis(next, startMonth) };
  }
  if (zoomKey === "semana") {
    const monday = mondayOf(date);
    const nextMonday = new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + 7));
    return { start: toAxis(monday, startMonth), end: toAxis(nextMonday, startMonth) };
  }
  const monthStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const nextMonthStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return { start: toAxis(monthStart, startMonth), end: toAxis(nextMonthStart, startMonth) };
}

function laneRowHeight(rowCount: number): number {
  const rows = Math.max(rowCount, 1);
  const packed = LANE_PADDING_Y * 2 + rows * BAR_HEIGHT + (rows - 1) * ROW_GAP;
  return Math.max(packed, MIN_LANE_ROW_HEIGHT);
}

function formatAxisDate(position: number, startMonth: string, monthAbbr: string[]): string {
  const d = fromAxis(position, startMonth);
  return `${d.getUTCDate()} ${monthAbbr[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`;
}

interface TooltipState {
  x: number;
  y: number;
  title: string;
  start: number;
  end: number;
  owners: string[];
  status: PhaseStatus;
}

interface GateTooltipState {
  x: number;
  y: number;
  label: string;
  date: string;
}

/**
 * Renders a program's PoAP grid: lanes with auto-stacked phase rows, a
 * stage-gate strip, and period bands. Pure presentational component — no
 * data fetching, no routing. Row counts per lane come from `packLane`
 * (src/components/poap-renderer/pack.ts); this component never decides how
 * phases get grouped into rows, only how a given row layout gets painted.
 *
 * Zoom, zoom-scale and Focus Cell are internal UI state, not props — all
 * three are purely about how this data gets displayed, not what the data
 * is. Zoom (Año/Mes/Semana/Día) changes the ruler's structure — what the
 * third row divides into, if anything; zoomScale is a continuous
 * multiplier on top of that (Excel-style +/- stepper) that only changes
 * column width, not structure.
 *
 * All horizontal placement goes through a DayScale (buildDayScale) so every
 * calendar day gets the same pixel width regardless of which month it's
 * in — see the comment on buildDayScale.
 *
 * The card has a fixed vertical budget (see .card's height in the CSS) with
 * its own internal scroll, rather than growing the whole page — the label
 * column and the timeline are separate scroll containers (the timeline
 * additionally scrolls horizontally, which the labels never should), kept
 * vertically in sync via syncScroll rather than a shared grid. The ruler
 * stays pinned to the top of that internal scroll via position: sticky.
 */
export function PoapRenderer({
  months,
  startMonth,
  locale = DEFAULT_LOCALE,
  lanes,
  bands = [],
  selectedPhaseId = null,
  onPhaseClick,
  activeGateIds: activeGateIdsProp = [],
  onGateClick,
  onLaneClick,
  onLaneGanttClick,
  activeGanttLaneId = null,
  onCreatePhase,
  isLaneCreatable,
  onResizePhase,
  onRenamePhase,
  isLaneManageable,
  onDeleteLane,
  onAddLaneBelow,
  onReorderLanes,
  showWeekends = true,
  showToday = true,
}: PoapRendererProps) {
  const monthAbbr = MONTH_ABBR[locale];
  const statusLabels = STATUS_LABELS[locale];
  const strings = RENDERER_STRINGS[locale];
  // How many of this canvas's own tracks (bars) land in each status —
  // generic across every level PoapRenderer renders (projects' own plan
  // tracks on the Program page, team lanes'/Plans'/Fases' real phases
  // inside a project), since it's computed straight from
  // whatever `lanes` this call was actually given rather than anything
  // Program-specific. Tallies every phase by its own status rather than
  // one worst-status verdict per lane — a lane mixing a done phase with an
  // at-risk one used to count as a single "at_risk" row and make its done
  // phase invisible to this count entirely, even though it renders as its
  // own done-colored bar right there in the calendar.
  const legendCounts = useMemo(() => {
    const counts: Record<PhaseStatus, number> = { done: 0, in_progress: 0, at_risk: 0, not_started: 0 };
    for (const lane of lanes) {
      for (const phase of lane.phases) counts[phase.status] += 1;
    }
    return counts;
  }, [lanes]);
  const timelineRef = useRef<HTMLDivElement>(null);
  const labelsColRef = useRef<HTMLDivElement>(null);
  // Wrapped lane-name text can need more vertical room than the row's own
  // bar-packed height (laneRowHeight) provides — measured post-render (see
  // the layout effect below) rather than estimated, since exact wrap
  // height depends on the rendered font/column width. Keyed by lane id,
  // read back into both renderLaneLabel and renderLaneTrack so the label
  // and its matching track row always end up the same height.
  const labelTextRefs = useRef<Map<string, HTMLSpanElement>>(new Map());
  const prevLabelHeightsRef = useRef<Record<string, number>>({});
  const [labelHeights, setLabelHeights] = useState<Record<string, number>>({});
  const [trackWidth, setTrackWidth] = useState(0);
  // Defaults to Semana at 25% rather than Año at 100% — a zoomed-out week
  // view lands the viewer on "what's happening around now" instead of the
  // whole program's year-scale shape. 0.25 is below the shared
  // ZOOM_SCALE_MIN floor (0.5) but still clears Semana's own, lower
  // minScale (0.2 — see ZOOM_LEVELS in constants.ts), which is what
  // actually gates the zoom-out stepper at this level.
  const [zoomKey, setZoomKey] = useState<ZoomLevel["key"]>("semana");
  const [zoomScale, setZoomScale] = useState(0.25);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [gateTooltip, setGateTooltip] = useState<GateTooltipState | null>(null);
  const [selectedColumn, setSelectedColumn] = useState<{ range: ColumnRange; unit: ColumnUnit } | null>(null);
  // A pending two-click track creation — see handleTrackClick. `rect` isn't
  // cached here on purpose: the two clicks can be seconds apart (a scroll
  // or resize in between would go stale), so every axis calculation
  // re-reads the track's current bounding rect off the live DOM event
  // instead.
  const [dragCreate, setDragCreate] = useState<{
    laneId: string;
    startAxis: number;
    currentAxis: number;
  } | null>(null);
  // Per-cell hover preview (see handleLaneHover) — keyed by which lane's
  // own track the mouse is over, not just an x-position, so the highlight
  // it drives can be painted inside just that one lane's row (renderLaneTrack)
  // instead of the old full-height column overlay.
  const [hoverCell, setHoverCell] = useState<{ laneId: string; start: number; end: number } | null>(null);
  // The phase whose own bar is currently showing its inline title editor
  // instead of its static label — set the moment a two-click track
  // creation commits (see handleTrackClick/onCreatePhase), cleared once
  // that editor blurs/submits (see Bar's own onCommitTitle). Internal, not
  // a controlled prop: the caller only needs to hand back the new phase's
  // id from onCreatePhase, everything about actually editing it lives
  // here.
  const [editingPhaseId, setEditingPhaseId] = useState<string | null>(null);
  // Delete confirmation is armed for at most one lane at a time — clicking
  // the trash icon swaps that row's Gantt/delete buttons for a compact
  // cancel/confirm pair instead of deleting immediately (see
  // renderLaneLabel); clicking anywhere else, or Escape, disarms it.
  const [confirmDeleteLaneId, setConfirmDeleteLaneId] = useState<string | null>(null);
  // Drag-and-drop reordering — team lanes only (see onReorderLanes). Native
  // HTML5 DnD rather than a custom mouse-tracked drag (unlike dragCreate
  // above): reordering a short list is exactly what it's built for, and it
  // comes with a free ghost image and drop-target semantics a mouse-event
  // reimplementation would just have to rebuild.
  const [dragLaneId, setDragLaneId] = useState<string | null>(null);
  const [dragOverLaneId, setDragOverLaneId] = useState<string | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<"before" | "after">("before");
  // A bar's own edge being dragged to change its start/end date (see the
  // resize handles in Bar) — a continuous mousedown-move-up gesture,
  // unlike dragCreate's two discrete clicks, so the track's bounding rect
  // is safe to cache once at mousedown rather than re-reading it live.
  const [resizeDrag, setResizeDrag] = useState<{
    laneId: string;
    phaseId: string;
    edge: "start" | "end";
    rect: DOMRect;
    originalStart: number;
    originalEnd: number;
    startAxis: number;
    currentAxis: number;
  } | null>(null);
  // Set for one tick right as a resize gesture releases (see handleUp
  // below) — a mousedown+drag+mouseup that starts on a resize handle but
  // ends elsewhere still makes the browser fire a synthetic "click" on the
  // track's own common ancestor afterward (mousedown/mouseup targets
  // differ), which handleTrackClick's own `closest("button")` guard can't
  // catch since that click's target is the track div itself, not the
  // handle. This flag lets handleTrackClick recognize and swallow exactly
  // that one follow-on click instead of misreading it as "empty space
  // clicked, start a new track." A ref, not state, so it's readable
  // synchronously inside that same click and never triggers a render.
  const resizeJustEndedRef = useRef(false);
  const activeGateIds = useMemo(() => new Set(activeGateIdsProp), [activeGateIdsProp]);

  const zoom = ZOOM_LEVELS.find((z) => z.key === zoomKey) ?? ZOOM_LEVELS[0]!;
  const scale = useMemo(() => buildDayScale(startMonth, months), [startMonth, months]);

  useLayoutEffect(() => {
    const el = timelineRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setTrackWidth(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const pxPerMonth = zoom.pxPerMonth * zoomScale;
  const timelineMinWidth = months * pxPerMonth;
  // The scroll container can be narrower than the content it holds (that's
  // the whole point of the horizontal-scroll fallback) — every pixel
  // calculation needs the *rendered* width of timelineInner, which is
  // whichever of the two is larger, not the raw ResizeObserver reading.
  const effectiveWidth = Math.max(trackWidth, timelineMinWidth);

  // Every gate across every lane, flattened — used only for the full-height
  // cut-line overlay (see focusOverlay below), which doesn't care which
  // lane a gate belongs to, just its date and whether it's active.
  const allGates = useMemo(() => lanes.flatMap((l) => l.gates ?? []), [lanes]);

  // Stage-gate collision avoidance, scoped per lane (each lane keeps its
  // own diamond+label row directly under its own track — see
  // renderLaneGatesTrack — instead of one shared row for the whole
  // calendar). Same "first row that fits" greedy packing packLane uses for
  // phases: drop each gate into the first sub-row whose last-placed gate
  // clears GATE_COLLISION_PX, tracking one "last x" per sub-row (rather
  // than only the immediately-previous gate) so two gates both close to a
  // third don't land on top of each other.
  const laneGatePacking = useMemo(() => {
    const result: Record<
      string,
      { sortedGates: Gate[]; gateOffsets: Record<string, number>; gateRowHeight: number }
    > = {};
    for (const lane of lanes) {
      const gates = lane.gates ?? [];
      if (gates.length === 0) continue;
      const sorted = [...gates].sort((a, b) => a.position - b.position);
      const offsets: Record<string, number> = {};
      const rowLastX: number[] = [];
      for (const gate of sorted) {
        const x = (axisToDays(gate.position, scale) / scale.totalDays) * effectiveWidth;
        let row = rowLastX.findIndex((lastX) => x - lastX >= GATE_COLLISION_PX);
        if (row === -1) {
          row = rowLastX.length;
          rowLastX.push(x);
        } else {
          rowLastX[row] = x;
        }
        offsets[gate.id] = row * GATE_SHIFT_PX;
      }
      const levels = Math.max(rowLastX.length, 1);
      result[lane.id] = {
        sortedGates: sorted,
        gateOffsets: offsets,
        gateRowHeight: GATES_ROW_BASE_HEIGHT + (levels - 1) * GATE_SHIFT_PX,
      };
    }
    return result;
  }, [lanes, effectiveWidth, scale]);

  const mSegments = useMemo(() => monthSegments(startMonth, months, monthAbbr), [startMonth, months, monthAbbr]);
  const ySegments = useMemo(() => yearSegments(startMonth, months), [startMonth, months]);
  // Internal year-change boundaries only (excludes idx 0, the plan's own
  // left edge) — these are the sole month-grid lines allowed to cross the
  // year row, since they simultaneously mark that year's end and the next
  // year's start.
  const yearBoundaries = useMemo(
    () => new Set(ySegments.map((seg) => seg.startIdx).filter((idx) => idx > 0)),
    [ySegments],
  );
  const sCells = useMemo(
    () => subCells(startMonth, months, zoom.subRowGranularity),
    [startMonth, months, zoom.subRowGranularity],
  );
  // Only meaningful at the Día zoom: at any coarser zoom a single day is a
  // sliver of a pixel, so the "columns" would render as visual noise
  // rather than a readable weekend marker — same reasoning as the
  // day-initial label above the sub row, which is Día-only for the same
  // reason.
  const wRanges = useMemo(
    () => (showWeekends && zoom.subRowGranularity === "day" ? weekendRanges(startMonth, months) : []),
    [startMonth, months, showWeekends, zoom.subRowGranularity],
  );
  const dayInitials = DAY_INITIALS[locale];

  // Today marker — only rendered when "today" actually falls inside the
  // plan's own axis range, since a plan viewed months before/after its
  // window shouldn't show a line pinned to one edge.
  const todayPosition = useMemo(() => {
    const now = new Date();
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const pos = toAxis(today, startMonth);
    return pos >= 0 && pos <= months ? pos : null;
  }, [startMonth, months]);

  const orderedLanes = useMemo(
    () => [...lanes].sort((a, b) => a.sortOrder - b.sortOrder),
    [lanes],
  );
  const packedLanes = useMemo(
    () => orderedLanes.map((lane) => ({ lane, rows: packLane(lane.phases) })),
    [orderedLanes],
  );

  useLayoutEffect(() => {
    function measure() {
      const next: Record<string, number> = {};
      let changed = Object.keys(prevLabelHeightsRef.current).length !== packedLanes.length;
      for (const { lane } of packedLanes) {
        const el = labelTextRefs.current.get(lane.id);
        const measured = el ? el.scrollHeight + LANE_PADDING_Y * 2 : 0;
        next[lane.id] = measured;
        if (measured !== prevLabelHeightsRef.current[lane.id]) changed = true;
      }
      if (changed) {
        prevLabelHeightsRef.current = next;
        setLabelHeights(next);
      }
    }
    measure();
    const el = labelsColRef.current;
    if (!el) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [packedLanes, locale]);
  // The project-plan lane (if any) always renders above every other lane —
  // pulled out of packedLanes' single sortOrder sequence rather than
  // relying on sortOrder alone to keep it first, since a plan lane's
  // sortOrder is really "first among team lanes" (a position sortOrder has
  // no way to express that on its own).
  const planPackedLanes = useMemo(() => packedLanes.filter((pl) => pl.lane.isProjectPlan), [packedLanes]);
  const teamPackedLanes = useMemo(() => packedLanes.filter((pl) => !pl.lane.isProjectPlan), [packedLanes]);

  const rulerHeight = YEAR_ROW_HEIGHT + MONTH_ROW_HEIGHT + (zoom.subRowGranularity !== "none" ? SUB_ROW_HEIGHT : 0);

  // A phase "touches" the focused column if their ranges overlap at all —
  // counted against every phase in the program.
  const touchedCount = useMemo(() => {
    if (selectedColumn === null) return 0;
    const { range } = selectedColumn;
    return orderedLanes
      .flatMap((l) => l.phases)
      .filter((p) => p.start < range.end && p.end > range.start).length;
  }, [orderedLanes, selectedColumn]);

  function selectZoom(key: ZoomLevel["key"]) {
    setZoomKey(key);
    setZoomScale(ZOOM_SCALE_DEFAULT);
    // A focused column is only meaningful relative to the grid it was
    // picked on — zooming changes what the columns even are, so a stale
    // range from the old grid would no longer land on a real boundary.
    setSelectedColumn(null);
  }

  function nudgeZoomScale(delta: number) {
    const min = zoom.minScale ?? ZOOM_SCALE_MIN;
    setZoomScale((prev) => Math.round(Math.min(ZOOM_SCALE_MAX, Math.max(min, prev + delta)) * 100) / 100);
  }

  // Focus Cell: which unit a click resolves to depends on which ruler row
  // was clicked, not on the zoom level directly — clicking the month row
  // always focuses a month, clicking the sub row focuses whatever it's
  // currently divided into. The click's pixel ratio is converted to a
  // real-day offset first (daysToAxis), matching how the grid is actually
  // drawn, not a naive fraction of `months`. Clicking the already-selected
  // column again clears it.
  function focusColumn(e: ReactMouseEvent<HTMLDivElement>, unit: ColumnUnit) {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const rawPosition = daysToAxis(ratio * scale.totalDays, scale);
    const range = columnRange(rawPosition, unit, startMonth);
    setSelectedColumn((prev) =>
      prev !== null && prev.unit === unit && Math.abs(prev.range.start - range.start) < 0.001
        ? null
        : { range, unit },
    );
  }

  // Create a track with two clicks, not a held-down drag: click once on an
  // expanded team/plan lane's empty track background (not on an existing
  // bar/button — those still just navigate, see the `closest("button")`
  // bail-out below) to drop the start date, move the mouse to preview the
  // range live, then click again — same lane or not — to drop the end
  // date and commit. Escape, or a click anywhere that isn't a creatable
  // track (a button, a different panel, ...), cancels the pending start
  // instead of leaving it stuck armed forever (see the outside-click
  // effect below, same shape as confirmDeleteLaneId's own).
  function axisFromClientX(clientX: number, rect: DOMRect): number {
    const ratio = (clientX - rect.left) / rect.width;
    return daysToAxis(ratio * scale.totalDays, scale);
  }

  function laneIsCreatable(laneId: string): boolean {
    return Boolean(onCreatePhase) && (!isLaneCreatable || isLaneCreatable(laneId));
  }

  function handleTrackClick(e: ReactMouseEvent<HTMLDivElement>, laneId: string) {
    if (!laneIsCreatable(laneId)) return;
    if ((e.target as HTMLElement).closest("button")) return;
    if (resizeJustEndedRef.current) {
      resizeJustEndedRef.current = false;
      return;
    }
    const axis = axisFromClientX(e.clientX, e.currentTarget.getBoundingClientRect());
    if (!dragCreate || dragCreate.laneId !== laneId) {
      // First click, or a click on a different lane than the one a
      // pending start was on — (re)arm here, discarding any unfinished
      // selection elsewhere rather than trying to span two lanes.
      setDragCreate({ laneId, startAxis: axis, currentAxis: axis });
      return;
    }
    // Second click on the same lane the start was dropped on — commit.
    const { start, end } = snapAxisRange(dragCreate.startAxis, axis, zoomKey, startMonth);
    const newPhaseId = onCreatePhase?.(laneId, start, end);
    setDragCreate(null);
    if (newPhaseId) setEditingPhaseId(newPhaseId);
  }

  // Cancels a pending start on Escape or a click outside any creatable
  // track (see data-range-track below) — without this, clicking away
  // after the first click would leave the preview line stuck on screen
  // with no way to finish or abandon it.
  useEffect(() => {
    if (!dragCreate) return;
    function onPointerDown(e: MouseEvent) {
      if ((e.target as HTMLElement).closest?.("[data-range-track]")) return;
      setDragCreate(null);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setDragCreate(null);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [dragCreate]);

  // Resize snaps to whatever unit is actually visible at the current zoom
  // — same idea as snapAxisRange, but computed per-edge since a resize only
  // ever moves one end of an existing track rather than both ends of a
  // fresh one. Día stays exact; Semana snaps to the Mon–Fri business week
  // the cursor is over (Monday for the start edge, Friday for the end);
  // Mes snaps to that month's first/last business day. Año never reaches
  // this — resize is disabled outright at that zoom (see onResizeStart
  // below) since there's no sub-month unit visible to snap to there.
  function snapResizeAxis(axis: number, edge: "start" | "end"): number {
    const date = fromAxis(axis, startMonth);
    if (zoomKey === "dia") {
      return toAxis(date, startMonth);
    }
    if (zoomKey === "semana") {
      const monday = mondayOf(date);
      return toAxis(edge === "start" ? monday : fridayOf(monday), startMonth);
    }
    return toAxis(edge === "start" ? firstBusinessDayOfMonth(date) : lastBusinessDayOfMonth(date), startMonth);
  }

  function addDaysAxis(axis: number, days: number): number {
    const d = fromAxis(axis, startMonth);
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days));
    return toAxis(next, startMonth);
  }

  // Starts a bar-edge resize — same rect-from-event approach as
  // handleTrackClick, just keyed off the nearest [data-lane-track-id]
  // ancestor instead of the track div itself, since the mousedown lands
  // on one of the bar's own edge handles rather than the track's empty
  // background.
  function handleResizeStart(e: ReactMouseEvent, laneId: string, phase: Phase, edge: "start" | "end") {
    e.preventDefault();
    e.stopPropagation();
    const trackEl = (e.target as HTMLElement).closest("[data-lane-track-id]") as HTMLElement | null;
    if (!trackEl) return;
    const rect = trackEl.getBoundingClientRect();
    const axis = axisFromClientX(e.clientX, rect);
    setResizeDrag({
      laneId,
      phaseId: phase.id,
      edge,
      rect,
      originalStart: phase.start,
      originalEnd: phase.end,
      startAxis: axis,
      currentAxis: axis,
    });
  }

  // Live-tracks the drag and commits on release — one document-level
  // listener pair for the whole gesture (the rect was cached at
  // mousedown, see resizeDrag's own comment), re-subscribed each time
  // resizeDrag's own currentAxis moves same as the dragCreate-cancel
  // effect above already does for its own state. handleUp reads
  // resizeDrag directly from the closure and calls onResizePhase as a
  // plain statement, deliberately *not* from inside the setResizeDrag
  // updater below it — a state updater must stay pure (React can and
  // does invoke it more than once, e.g. under StrictMode, specifically
  // to catch exactly this), and onResizePhase triggers a different
  // component's own state update, which is a side effect.
  useEffect(() => {
    if (!resizeDrag) return;
    const drag = resizeDrag;
    function handleMove(e: MouseEvent) {
      setResizeDrag((prev) => (prev ? { ...prev, currentAxis: axisFromClientX(e.clientX, prev.rect) } : prev));
    }
    function handleUp() {
      setResizeDrag(null);
      resizeJustEndedRef.current = true;
      // A use-once guard (see its own declaration) — cleared shortly after
      // in case the browser never actually follows this mouseup with a
      // synthetic click on the track (e.g. touch input), so it can't get
      // stuck swallowing some unrelated later click.
      window.setTimeout(() => {
        resizeJustEndedRef.current = false;
      }, 0);
      // A plain click on the handle (mouseup without ever moving to a
      // different snap unit than where the drag started) must leave the
      // phase's dates completely untouched — comparing the *snapped start
      // and current axis* here, not the final computed start/end against
      // originalStart/originalEnd, since snapResizeAxis(drag.startAxis)
      // can legitimately land on a different value than the phase's own
      // (not necessarily snap-aligned) start/end even with zero real
      // pointer movement.
      if (snapResizeAxis(drag.currentAxis, drag.edge) === snapResizeAxis(drag.startAxis, drag.edge)) return;
      const snapped = snapResizeAxis(drag.currentAxis, drag.edge);
      const start = drag.edge === "start" ? Math.min(snapped, addDaysAxis(drag.originalEnd, -1)) : drag.originalStart;
      const end = drag.edge === "end" ? Math.max(snapped, addDaysAxis(drag.originalStart, 1)) : drag.originalEnd;
      if (start !== drag.originalStart || end !== drag.originalEnd) {
        onResizePhase?.(drag.laneId, drag.phaseId, start, end);
      }
    }
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
    return () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
    };
  }, [resizeDrag]);

  // Animated hover highlight — a live preview of what dragging from here
  // would snap to (see snapAxisRange), shown continuously as the mouse
  // moves over a creatable lane's own track, not just while actually
  // dragging. Scoped to one lane at a time (see hoverCell/renderLaneTrack)
  // so the highlight paints inside just that row instead of spanning every
  // lane the way a single canvas-wide hover tracker would.
  function handleLaneHover(e: ReactMouseEvent<HTMLDivElement>, laneId: string) {
    const rect = e.currentTarget.getBoundingClientRect();
    const axis = axisFromClientX(e.clientX, rect);
    setHoverCell({ laneId, ...hoverCellRange(axis, zoomKey, startMonth) });
    // Also advances the pending two-click range's live end (see
    // handleTrackClick) while the mouse moves over the lane the start was
    // dropped on — this is what makes the preview line track the cursor
    // between the two clicks instead of just sitting still.
    if (dragCreate && dragCreate.laneId === laneId) {
      setDragCreate((prev) => (prev ? { ...prev, currentAxis: axis } : prev));
    }
  }

  // Dismisses an armed delete confirmation on Escape or a click anywhere
  // outside that row's own cancel/confirm buttons — same "arm, then
  // require a deliberate follow-up or it quietly goes away" shape as
  // useSidePanel's click-outside-to-close, just scoped to this one small
  // inline popover instead of a whole panel.
  useEffect(() => {
    if (!confirmDeleteLaneId) return;
    function onPointerDown(e: MouseEvent) {
      if ((e.target as HTMLElement).closest?.("[data-delete-confirm]")) return;
      setConfirmDeleteLaneId(null);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setConfirmDeleteLaneId(null);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [confirmDeleteLaneId]);

  // Drag-and-drop reordering — team lanes only, see onReorderLanes'
  // own doc comment. `isDraggable` gates whether this particular row can
  // ever be picked up (never the isProjectPlan anchor lane); dragging that
  // starts on one of the row's own buttons (name/gantt/delete/add-below)
  // is left alone so those clicks keep working normally — only a real drag
  // gesture starting on genuinely empty row space (or the grip icon) ever
  // fires dragstart in the first place.
  function handleLaneDragStart(e: ReactDragEvent<HTMLDivElement>, laneId: string, isDraggable: boolean) {
    if (!isDraggable || (e.target as HTMLElement).closest("button")) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", laneId);
    setDragLaneId(laneId);
  }

  // A drop is only ever valid on another *team* lane's row — dragging over
  // the anchor lane (or anywhere dragover isn't explicitly allowed via
  // preventDefault) just never becomes a drop target.
  function handleLaneDragOver(e: ReactDragEvent<HTMLDivElement>, laneId: string) {
    if (!dragLaneId || laneId === dragLaneId) return;
    if (!teamPackedLanes.some((pl) => pl.lane.id === laneId)) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    setDragOverLaneId(laneId);
    setDragOverPosition(e.clientY - rect.top < rect.height / 2 ? "before" : "after");
  }

  function handleLaneDrop(e: ReactDragEvent<HTMLDivElement>, laneId: string) {
    e.preventDefault();
    const sourceId = dragLaneId;
    const position = dragOverPosition;
    setDragLaneId(null);
    setDragOverLaneId(null);
    if (!sourceId || !onReorderLanes || sourceId === laneId) return;
    const ids = teamPackedLanes.map((pl) => pl.lane.id);
    const from = ids.indexOf(sourceId);
    if (from === -1 || !ids.includes(laneId)) return;
    const next = [...ids];
    next.splice(from, 1);
    let insertAt = next.indexOf(laneId);
    if (insertAt === -1) return;
    if (position === "after") insertAt += 1;
    next.splice(insertAt, 0, sourceId);
    onReorderLanes(next);
  }

  function handleLaneDragEnd() {
    setDragLaneId(null);
    setDragOverLaneId(null);
  }

  function showTooltip(e: { clientX: number; clientY: number }, data: Omit<TooltipState, "x" | "y">) {
    setTooltip({ ...data, x: e.clientX, y: e.clientY });
  }

  function showGateTooltip(e: { clientX: number; clientY: number }, gate: { label: string; position: number }) {
    setGateTooltip({
      x: e.clientX,
      y: e.clientY,
      label: gate.label,
      date: formatAxisDate(gate.position, startMonth, monthAbbr),
    });
  }

  // The label column and the timeline are separate scroll containers (the
  // timeline also needs to scroll horizontally, which the labels never
  // should), so vertical scroll position is kept in sync manually — each
  // one's scroll event mirrors onto the other. Setting scrollTop to a value
  // it already has doesn't re-fire that element's own scroll event, so this
  // can't ping-pong.
  function syncScroll(source: HTMLDivElement, target: HTMLDivElement | null) {
    if (target && target.scrollTop !== source.scrollTop) target.scrollTop = source.scrollTop;
  }

  // Shared between the plan-lane and team-lane render passes below (see
  // planPackedLanes/teamPackedLanes) so the two lane groups stay pixel- and
  // behavior-identical apart from the plan lane's own accent class.
  function renderLaneLabel({ lane, rows }: (typeof packedLanes)[number]) {
    // Must match renderLaneTrack's own height calc exactly (see its
    // gatesHeight comment) — the label and track sides of a row are always
    // rendered the same height so they stay lined up as the calendar
    // scrolls vertically.
    const gatesHeight = laneGatePacking[lane.id]?.gateRowHeight ?? 0;
    const height = Math.max(laneRowHeight(rows.length) + gatesHeight, labelHeights[lane.id] ?? 0);
    const isAnchor = Boolean(lane.isProjectPlan);
    const manageable = isLaneManageable ? isLaneManageable(lane.id) : true;
    const isDraggable = !isAnchor && manageable && Boolean(onReorderLanes);
    const isConfirmingDelete = confirmDeleteLaneId === lane.id;
    const isDropTarget = dragOverLaneId === lane.id;
    return (
      <div
        key={lane.id}
        className={[
          styles.labelCell,
          styles.laneLabel,
          lane.isProjectPlan ? styles.planLaneLabel : "",
          dragLaneId === lane.id ? styles.laneLabelDragging : "",
          isDropTarget ? (dragOverPosition === "before" ? styles.laneLabelDropBefore : styles.laneLabelDropAfter) : "",
        ]
          .join(" ")
          .trim()}
        style={{ height }}
        draggable={isDraggable}
        onDragStart={(e) => handleLaneDragStart(e, lane.id, isDraggable)}
        onDragOver={onReorderLanes ? (e) => handleLaneDragOver(e, lane.id) : undefined}
        onDrop={onReorderLanes ? (e) => handleLaneDrop(e, lane.id) : undefined}
        onDragEnd={onReorderLanes ? handleLaneDragEnd : undefined}
      >
        {onReorderLanes &&
          (isDraggable ? (
            <span className={styles.dragHandle} aria-hidden="true" title={strings.dragLaneAria(lane.name)}>
              <IconGrip />
            </span>
          ) : isAnchor ? (
            <span className={styles.anchorPin} aria-hidden="true" title={strings.anchorLaneAria}>
              <IconPinOff />
            </span>
          ) : (
            <span className={styles.dragHandleSpacer} aria-hidden="true" />
          ))}
        {onAddLaneBelow && (
          <button
            type="button"
            className={styles.leadingButton}
            onClick={() => onAddLaneBelow(lane.id)}
            aria-label={strings.addLaneBelowAria}
            title={strings.addLaneBelowAria}
          >
            <IconPlus />
          </button>
        )}
        <button type="button" className={styles.laneNameButton} onClick={() => onLaneClick?.(lane.id)}>
          <span
            ref={(el) => {
              if (el) labelTextRefs.current.set(lane.id, el);
              else labelTextRefs.current.delete(lane.id);
            }}
            className={styles.laneLabelText}
          >
            {lane.name}
          </span>
        </button>
        {isConfirmingDelete ? (
          <span className={styles.deleteConfirmGroup} data-delete-confirm={lane.id}>
            <span className={styles.confirmDeleteLabel}>{strings.confirmDeleteLabel}</span>
            <span className={styles.confirmButtonsRow}>
              <button
                type="button"
                className={styles.confirmCancelButton}
                onClick={() => setConfirmDeleteLaneId(null)}
                aria-label={strings.cancelDeleteAria}
                title={strings.cancelDeleteAria}
              >
                <IconClose />
              </button>
              <button
                type="button"
                className={styles.confirmDeleteButton}
                onClick={() => {
                  onDeleteLane?.(lane.id);
                  setConfirmDeleteLaneId(null);
                }}
                aria-label={strings.confirmDeleteAria(lane.name)}
                title={strings.confirmDeleteAria(lane.name)}
              >
                <IconCheck />
              </button>
            </span>
          </span>
        ) : (
          <span className={styles.laneRowActions}>
            {onLaneGanttClick && (
              <button
                type="button"
                data-gantt-button="true"
                className={[styles.ganttButton, activeGanttLaneId === lane.id ? styles.ganttButtonActive : ""]
                  .join(" ")
                  .trim()}
                onClick={() => onLaneGanttClick(lane.id)}
                aria-label={strings.viewGanttAria}
                title={strings.viewGanttAria}
                aria-pressed={activeGanttLaneId === lane.id}
              >
                <IconGantt />
              </button>
            )}
            {onDeleteLane && !isAnchor && manageable && (
              <button
                type="button"
                className={styles.deleteLaneButton}
                onClick={() => setConfirmDeleteLaneId(lane.id)}
                aria-label={strings.deleteLaneAria(lane.name)}
                title={strings.deleteLaneAria(lane.name)}
              >
                <IconTrash />
              </button>
            )}
          </span>
        )}
      </div>
    );
  }

  function renderLaneTrack({ lane, rows }: (typeof packedLanes)[number]) {
    // A lane's own stage gates (see Lane.gates) render inside this same
    // track box — a reserved strip of diamonds above its phase bars, not a
    // second row/swimline below it (that was tried and read as "a new,
    // empty lane" to users). gatesHeight is folded into both this track's
    // and renderLaneLabel's height so the label/track pair stays in
    // lockstep at the taller of "room for phases" vs "room for gates".
    const gatePacking = laneGatePacking[lane.id];
    const gatesHeight = gatePacking?.gateRowHeight ?? 0;
    const height = Math.max(laneRowHeight(rows.length) + gatesHeight, labelHeights[lane.id] ?? 0);
    const trackClass = [
      styles.laneTrack,
      lane.isProjectPlan ? styles.planLaneTrack : "",
      dragLaneId === lane.id ? styles.laneTrackDragging : "",
    ]
      .join(" ")
      .trim();
    const creatable = laneIsCreatable(lane.id);
    return (
      <div
        key={lane.id}
        className={`${trackClass} ${creatable ? styles.laneTrackCreatable : ""}`.trim()}
        style={{ height }}
        data-range-track={creatable ? "true" : undefined}
        data-lane-track-id={lane.id}
        onClick={creatable ? (e) => handleTrackClick(e, lane.id) : undefined}
        onMouseMove={creatable ? (e) => handleLaneHover(e, lane.id) : undefined}
        onMouseLeave={creatable ? () => setHoverCell(null) : undefined}
      >
        {hoverCell && hoverCell.laneId === lane.id && !dragCreate && (
          <div
            className={styles.hoverCellHighlight}
            style={{ left: pct(hoverCell.start, scale), width: pctSpan(hoverCell.start, hoverCell.end, scale) }}
          />
        )}
        {gatePacking && (
          <div className={styles.gatesRow} style={{ height: gatesHeight }}>
            {gatePacking.sortedGates.map((gate) => {
              const active = activeGateIds.has(gate.id);
              return (
                <button
                  key={gate.id}
                  type="button"
                  className={`${styles.gate} ${active ? styles.gateActive : ""}`}
                  style={{ left: pct(gate.position, scale), top: gatePacking.gateOffsets[gate.id] }}
                  onClick={() => onGateClick?.(gate.id)}
                  onMouseMove={(e) => showGateTooltip(e, gate)}
                  onMouseLeave={() => setGateTooltip(null)}
                  onFocus={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    showGateTooltip({ clientX: rect.left, clientY: rect.bottom }, gate);
                  }}
                  onBlur={() => setGateTooltip(null)}
                  aria-pressed={active}
                >
                  <span className={styles.gateDiamond} aria-hidden="true" />
                  <span className={styles.gateLabel}>{gate.label}</span>
                </button>
              );
            })}
          </div>
        )}
        {rows.map((row, r) => (
          <div key={r} className={styles.laneRow}>
            {row.map((phase) => (
              <Bar
                key={phase.id}
                phase={phase}
                scale={scale}
                trackWidth={effectiveWidth}
                selected={phase.id === selectedPhaseId}
                onClick={onPhaseClick}
                onHover={showTooltip}
                onLeave={() => setTooltip(null)}
                onResizeStart={
                  onResizePhase && zoomKey !== "anio" ? (e, edge) => handleResizeStart(e, lane.id, phase, edge) : undefined
                }
                resizeLive={
                  resizeDrag && resizeDrag.phaseId === phase.id
                    ? { edge: resizeDrag.edge, axis: snapResizeAxis(resizeDrag.currentAxis, resizeDrag.edge) }
                    : null
                }
                editing={phase.id === editingPhaseId}
                onCommitTitle={
                  onRenamePhase
                    ? (title) => {
                        onRenamePhase(lane.id, phase.id, title);
                        setEditingPhaseId(null);
                      }
                    : undefined
                }
                strings={strings}
              />
            ))}
          </div>
        ))}
        {dragCreate &&
          dragCreate.laneId === lane.id &&
          (() => {
            const snapped = snapAxisRange(dragCreate.startAxis, dragCreate.currentAxis, zoomKey, startMonth);
            return (
              <div
                className={styles.dragCreatePreview}
                style={{ left: pct(snapped.start, scale), width: pctSpan(snapped.start, snapped.end, scale) }}
              />
            );
          })()}
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <div className={styles.toolbar}>
        <Legend statusLabels={statusLabels} counts={legendCounts} />
        <div className={styles.toolbarControls}>
          <div className={styles.scaleGroup} role="group" aria-label={strings.continuousZoom}>
            <button
              type="button"
              className={styles.scaleButton}
              onClick={() => nudgeZoomScale(-ZOOM_SCALE_STEP)}
              disabled={zoomScale <= (zoom.minScale ?? ZOOM_SCALE_MIN)}
              aria-label={strings.zoomOut}
            >
              <IconMinus />
            </button>
            <span className={styles.scaleValue}>{Math.round(zoomScale * 100)}%</span>
            <button
              type="button"
              className={styles.scaleButton}
              onClick={() => nudgeZoomScale(ZOOM_SCALE_STEP)}
              disabled={zoomScale >= ZOOM_SCALE_MAX}
              aria-label={strings.zoomIn}
            >
              <IconPlus />
            </button>
          </div>
          <div className={styles.zoomGroup} role="group" aria-label={strings.zoomLevel}>
            {ZOOM_LEVELS.map((z) => (
              <button
                key={z.key}
                type="button"
                className={`${styles.zoomButton} ${z.key === zoomKey ? styles.zoomButtonActive : ""}`}
                onClick={() => selectZoom(z.key)}
              >
                {ZOOM_LABELS[locale][z.key]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.chart}>
        <div
          ref={labelsColRef}
          className={styles.labelsCol}
          style={{ width: LABEL_COL_WIDTH }}
          onScroll={(e) => syncScroll(e.currentTarget, timelineRef.current)}
        >
          <div
            className={`${styles.labelCell} ${styles.labelHeaderCell}`}
            style={{ height: rulerHeight + BADGE_STRIP_HEIGHT }}
          />
          {planPackedLanes.map((pl) => renderLaneLabel(pl))}
          {teamPackedLanes.map((pl) => renderLaneLabel(pl))}
        </div>

        <div
          ref={timelineRef}
          className={styles.timelineScroll}
          onScroll={(e) => syncScroll(e.currentTarget, labelsColRef.current)}
        >
          <div className={styles.timelineInner} style={{ minWidth: timelineMinWidth }}>
            <div className={styles.bandsOverlay} aria-hidden="true">
              {bands.map((band) => (
                <div
                  key={band.id}
                  className={styles.band}
                  style={{ left: pct(band.start, scale), width: pctSpan(band.start, band.end, scale) }}
                  title={band.label}
                />
              ))}
              {/* Weekend tint — painted after period bands so it stays
                  visibly distinct even where a band already tints the
                  background. Sits behind every bar/gate (see .weekendBand),
                  same "behind everything" role as .band. */}
              {wRanges.map((range, i) => (
                <div
                  key={`we${i}`}
                  className={styles.weekendBand}
                  style={{ left: pct(range.start, scale), width: pctSpan(range.start, range.end, scale) }}
                />
              ))}
              {/* Month lines only cross the year row at an actual year
                  change (top: BADGE_STRIP_HEIGHT, i.e. right at the ruler's
                  own top) — everywhere else they start below it, at the
                  top of the month row, so they don't draw through the
                  year label. Both offsets are pushed down by the badge
                  strip reserved above the ruler. */}
              {Array.from({ length: months + 1 }, (_, i) => (
                <div
                  key={`m${i}`}
                  className={styles.monthGridLine}
                  style={{
                    left: pct(i, scale),
                    top: BADGE_STRIP_HEIGHT + (yearBoundaries.has(i) ? 0 : YEAR_ROW_HEIGHT),
                  }}
                />
              ))}
              {/* Day/week lines only reach up to the sub row — they never
                  cross the month or year rows above it. */}
              {sCells.map((cell, i) => (
                <div
                  key={`s${i}`}
                  className={styles.subGridLine}
                  style={{ left: pct(cell.start, scale), top: BADGE_STRIP_HEIGHT + YEAR_ROW_HEIGHT + MONTH_ROW_HEIGHT }}
                />
              ))}
            </div>

            {/* Reserved, otherwise-invisible strip above the ruler —
                where the today/selected-column badges actually live, so
                they never overlap the year row or any content below it.
                Sticky at the very top, above the ruler's own sticky
                offset (which starts right below this strip). */}
            <div className={styles.badgeStrip} style={{ height: BADGE_STRIP_HEIGHT }} aria-hidden="true">
              {showToday && todayPosition !== null && (
                <div className={styles.todayBadge} style={{ left: pct(todayPosition, scale) }}>
                  {strings.today}
                </div>
              )}
              {selectedColumn !== null && (
                <div className={styles.columnBadge} style={{ left: pct(selectedColumn.range.start, scale) }}>
                  {formatColumnLabel(selectedColumn.range, selectedColumn.unit, startMonth, monthAbbr, strings.weekOfPrefix)} ·{" "}
                  {touchedCount} {pluralForm(touchedCount, { one: strings.phaseOne, other: strings.phaseOther })}
                </div>
              )}
            </div>

            <div className={styles.ruler} style={{ height: rulerHeight, top: BADGE_STRIP_HEIGHT }}>
              <div className={styles.yearRow} style={{ height: YEAR_ROW_HEIGHT }}>
                {ySegments.map((seg) => (
                  <div
                    key={seg.year}
                    className={styles.yearCell}
                    style={{ left: pct(seg.startIdx, scale), width: pctSpan(seg.startIdx, seg.startIdx + seg.span, scale) }}
                  >
                    <span className={styles.yearCellLabel}>{seg.year}</span>
                  </div>
                ))}
              </div>
              <div className={styles.monthHeader} style={{ height: MONTH_ROW_HEIGHT }} onClick={(e) => focusColumn(e, "month")}>
                {mSegments.map((seg) => (
                  <div
                    key={seg.startIdx}
                    className={styles.monthCell}
                    style={{ left: pct(seg.startIdx, scale), width: pctSpan(seg.startIdx, seg.startIdx + 1, scale) }}
                  >
                    <span className={styles.monthCellLabel}>{seg.label}</span>
                  </div>
                ))}
              </div>
              {zoom.subRowGranularity !== "none" && (
                <div
                  className={styles.subRow}
                  style={{ height: SUB_ROW_HEIGHT }}
                  onClick={(e) => focusColumn(e, zoom.subRowGranularity as ColumnUnit)}
                >
                  {sCells.map((cell, i) => {
                    const isWeekend = cell.dow === 0 || cell.dow === 6;
                    return (
                      <div
                        key={i}
                        className={[
                          styles.subCell,
                          zoom.subRowGranularity === "day" ? styles.subCellDay : "",
                          showWeekends && zoom.subRowGranularity === "day" && isWeekend ? styles.subCellWeekend : "",
                        ].join(" ").trim()}
                        style={{ left: pct(cell.start, scale), width: pctSpan(cell.start, cell.end, scale) }}
                      >
                        {zoom.subRowGranularity === "day" && (
                          <span className={styles.subCellDow}>{dayInitials[cell.dow]}</span>
                        )}
                        {cell.label}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {planPackedLanes.map((pl) => renderLaneTrack(pl))}

            {teamPackedLanes.map((pl) => renderLaneTrack(pl))}

            {/* Top overlay — last in DOM so it paints above every bar, gate
                and ruler cell (all of which are `position: relative` and
                therefore share this same paint tier, ordered by DOM
                position). Kept separate from bandsOverlay, which is first
                in DOM specifically so period bands stay *behind* everything.
                Holds both Focus Cell's highlight and active stage-gate
                lines — unrelated features, same "always on top" need. */}
            <div className={styles.focusOverlay} aria-hidden="true">
              {showToday && todayPosition !== null && <div className={styles.todayLine} style={{ left: pct(todayPosition, scale) }} />}
              {allGates
                .filter((g) => activeGateIds.has(g.id))
                .map((g) => (
                  <div
                    key={g.id}
                    className={styles.gateLine}
                    style={{
                      left: pct(g.position, scale),
                      // A constant top (right below the ruler), not
                      // anchored to this gate's own diamond row — unlike
                      // the old single shared gates row, a gate now lives
                      // wherever its own lane happens to sit, so the line
                      // has to span the whole calendar body regardless of
                      // which lane that is, to stay a legible cross-team
                      // milestone marker.
                      top: BADGE_STRIP_HEIGHT + rulerHeight,
                    }}
                  />
                ))}
              {selectedColumn !== null && (
                <div
                  className={styles.columnHighlight}
                  style={{
                    left: pct(selectedColumn.range.start, scale),
                    width: pctSpan(selectedColumn.range.start, selectedColumn.range.end, scale),
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {tooltip && (
        <Tooltip data={tooltip} startMonth={startMonth} monthAbbr={monthAbbr} strings={strings} statusLabels={statusLabels} />
      )}
      {gateTooltip && <GateTooltip data={gateTooltip} strings={strings} />}
    </div>
  );
}

function Bar({
  phase,
  scale,
  trackWidth,
  selected,
  onClick,
  onHover,
  onLeave,
  onResizeStart,
  resizeLive,
  editing,
  onCommitTitle,
  strings,
}: {
  phase: Phase;
  scale: DayScale;
  trackWidth: number;
  selected: boolean;
  onClick?: (phaseId: string) => void;
  onHover: (e: { clientX: number; clientY: number }, data: Omit<TooltipState, "x" | "y">) => void;
  onLeave: () => void;
  /** Present only when the caller passed onResizePhase — renders the two
   * edge handles at all (see .barResizeHandle's own hover-reveal) and
   * arms a drag on whichever one is grabbed. */
  onResizeStart?: (e: ReactMouseEvent, edge: "start" | "end") => void;
  /** Non-null only while *this* bar's own edge is the one currently being
   * dragged — overrides the displayed start/end with the live (already
   * day-snapped) value so the bar visibly follows the cursor before the
   * drag actually commits on mouseup. */
  resizeLive?: { edge: "start" | "end"; axis: number } | null;
  /** True for the one bar PoapRenderer just created via its own two-click
   * gesture (see onCreatePhase/editingPhaseId) — swaps the static label
   * for a focused, select-all text input right on the bar itself instead
   * of the normal click/hover/resize affordances, so naming a fresh track
   * never has to leave the canvas. */
  editing?: boolean;
  onCommitTitle?: (title: string) => void;
  strings: (typeof RENDERER_STRINGS)[Locale];
}) {
  const displayStart = resizeLive?.edge === "start" ? resizeLive.axis : phase.start;
  const displayEnd = resizeLive?.edge === "end" ? resizeLive.axis : phase.end;
  const spanDays = axisToDays(displayEnd, scale) - axisToDays(displayStart, scale);
  const widthPx = trackWidth ? (spanDays / scale.totalDays) * trackWidth : Infinity;
  const showText = widthPx >= BAR_MIN_TEXT_PX;

  if (editing && onCommitTitle) {
    return (
      <span
        className={styles.barWrap}
        style={{ left: pct(displayStart, scale), width: pctSpan(displayStart, displayEnd, scale) }}
      >
        <span className={[styles.bar, styles.barEditing, STATUS_CLASS[phase.status]].join(" ")}>
          <input
            type="text"
            className={styles.barLabelInput}
            defaultValue={phase.title}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => onCommitTitle(e.currentTarget.value.trim() || phase.title)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
            }}
          />
        </span>
      </span>
    );
  }

  return (
    <span
      className={styles.barWrap}
      style={{ left: pct(displayStart, scale), width: pctSpan(displayStart, displayEnd, scale) }}
    >
      <button
        type="button"
        className={[
          styles.bar,
          onResizeStart ? styles.barResizable : "",
          STATUS_CLASS[phase.status],
          selected ? styles.barSelected : "",
          showText ? "" : styles.barNoText,
        ].join(" ").trim()}
        onClick={() => onClick?.(phase.id)}
        onMouseMove={(e) =>
          onHover(e, {
            title: phase.title,
            start: phase.start,
            end: phase.end,
            owners: phase.owners ?? [],
            status: phase.status,
          })
        }
        onMouseLeave={onLeave}
        onFocus={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          onHover(
            { clientX: rect.left, clientY: rect.bottom },
            { title: phase.title, start: phase.start, end: phase.end, owners: phase.owners ?? [], status: phase.status },
          );
        }}
        onBlur={onLeave}
      >
        {showText && <span className={styles.barLabel}>{phase.title}</span>}
      </button>
      {onResizeStart && (
        <>
          <button
            type="button"
            className={`${styles.barResizeHandle} ${styles.barResizeHandleLeft} ${resizeLive?.edge === "start" ? styles.barResizeHandleActive : ""}`}
            onMouseDown={(e) => onResizeStart(e, "start")}
            aria-label={strings.resizeStartAria}
            title={strings.resizeStartAria}
          >
            <IconChevronLeft />
          </button>
          <button
            type="button"
            className={`${styles.barResizeHandle} ${styles.barResizeHandleRight} ${resizeLive?.edge === "end" ? styles.barResizeHandleActive : ""}`}
            onMouseDown={(e) => onResizeStart(e, "end")}
            aria-label={strings.resizeEndAria}
            title={strings.resizeEndAria}
          >
            <IconChevronRight />
          </button>
        </>
      )}
    </span>
  );
}

function Tooltip({
  data,
  startMonth,
  monthAbbr,
  strings,
  statusLabels,
}: {
  data: TooltipState;
  startMonth: string;
  monthAbbr: string[];
  strings: (typeof RENDERER_STRINGS)[Locale];
  statusLabels: Record<PhaseStatus, string>;
}) {
  return (
    <div className={styles.tooltip} style={{ left: data.x + 14, top: data.y + 14 }}>
      <p className={styles.tooltipTitle}>{data.title}</p>
      <div className={styles.tooltipRow}>
        <span>{strings.start}</span>
        <b>{formatAxisDate(data.start, startMonth, monthAbbr)}</b>
      </div>
      <div className={styles.tooltipRow}>
        <span>{strings.end}</span>
        <b>{formatAxisDate(data.end, startMonth, monthAbbr)}</b>
      </div>
      <div className={styles.tooltipRow}>
        <span>{strings.involved}</span>
        <b>{data.owners.length ? data.owners.join(", ") : "—"}</b>
      </div>
      <div className={styles.tooltipStatus}>
        <span className={styles.tooltipDot} style={{ background: `var(--${legendColorVar(data.status)})` }} />
        {statusLabels[data.status]}
      </div>
    </div>
  );
}

function GateTooltip({ data, strings }: { data: GateTooltipState; strings: (typeof RENDERER_STRINGS)[Locale] }) {
  return (
    <div className={styles.tooltip} style={{ left: data.x + 14, top: data.y + 14 }}>
      <p className={styles.tooltipTitle}>{data.label}</p>
      <div className={styles.tooltipRow}>
        <span>{strings.date}</span>
        <b>{data.date}</b>
      </div>
    </div>
  );
}

function Legend({
  statusLabels,
  counts,
}: {
  statusLabels: Record<PhaseStatus, string>;
  /** How many of the canvas's own tracks are currently at each status —
   * see legendCounts above. Each status renders as its small rounded-
   * square count badge (no separate dot — the badge's own color already
   * carries that) followed by its label text, showing 0 rather than
   * hiding the item when a status has no tracks (this replaced the
   * Program page's separate "N projects · X at risk…" strip, which used
   * to hide empty statuses instead). */
  counts: Record<PhaseStatus, number>;
}) {
  const items: PhaseStatus[] = ["done", "in_progress", "at_risk", "not_started"];
  return (
    <div className={styles.legend}>
      {items.map((status) => (
        <span key={status} className={styles.legendItem}>
          <span
            className={styles.legendCount}
            style={{
              background: `color-mix(in srgb, var(--${legendColorVar(status)}) 18%, var(--color-surface))`,
              color: `var(--${legendColorVar(status)}-ink, var(--${legendColorVar(status)}))`,
            }}
          >
            {counts[status]}
          </span>
          {statusLabels[status]}
        </span>
      ))}
    </div>
  );
}

function legendColorVar(status: PhaseStatus): string {
  switch (status) {
    case "done": return "color-mint";
    case "in_progress": return "color-iris";
    case "at_risk": return "color-amber";
    case "not_started": return "color-fog";
  }
}

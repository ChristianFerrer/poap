"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent } from "react";
import { packLane } from "./pack";
import { fromAxis, toAxis } from "./toAxis";
import { worstStatus } from "@/lib/portfolio";
import type { Lane, Phase, PhaseStatus, PoapRendererProps } from "./types";
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
import { IconCheck, IconClose, IconGantt, IconGrip, IconMinus, IconPlus, IconTrash, IconWarning } from "@/lib/icons";
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
  gates = [],
  bands = [],
  selectedPhaseId = null,
  onPhaseClick,
  activeGateIds: activeGateIdsProp = [],
  onGateClick,
  onLaneClick,
  onLaneGanttClick,
  activeGanttLaneId = null,
  onGatesLabelClick,
  onCreatePhase,
  isLaneCreatable,
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
  // How many of this canvas's own rows land in each status — generic across
  // every level PoapRenderer renders (projects on the Program page, team
  // lanes/Plans/Fases inside a project), since it's computed straight from
  // whatever `lanes` this call was actually given rather than anything
  // Program-specific. A lane with no phases yet reads as "not_started"
  // rather than needing a special empty case in the caller.
  const legendCounts = useMemo(() => {
    const counts: Record<PhaseStatus, number> = { done: 0, in_progress: 0, at_risk: 0, not_started: 0 };
    for (const lane of lanes) {
      const status = lane.phases.length === 0 ? "not_started" : worstStatus(lane.phases);
      counts[status] += 1;
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

  const sortedGates = useMemo(
    () => [...gates].sort((a, b) => a.position - b.position),
    [gates],
  );

  // Stage-gate collision avoidance: greedily drop each gate into the first
  // row whose last-placed gate clears GATE_COLLISION_PX, same "first row
  // that fits" idea as packLane. Tracking one "last x" per row (rather than
  // comparing only to the immediately-previous gate) avoids two gates that
  // are both close to a third landing on top of each other.
  const { gateOffsets, gateRowLevels } = useMemo(() => {
    const offsets: Record<string, number> = {};
    const rowLastX: number[] = [];
    for (const gate of sortedGates) {
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
    return { gateOffsets: offsets, gateRowLevels: Math.max(rowLastX.length, 1) };
  }, [sortedGates, effectiveWidth, scale]);

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
  // The project-plan lane (if any) always renders above Stage gates, and
  // every other lane below it — pulled out of packedLanes' single sortOrder
  // sequence rather than relying on sortOrder alone to keep it first, since
  // a plan lane's sortOrder is really "first among team lanes", not "before
  // the gates row" (a position sortOrder has no way to express on its own).
  const planPackedLanes = useMemo(() => packedLanes.filter((pl) => pl.lane.isProjectPlan), [packedLanes]);
  const teamPackedLanes = useMemo(() => packedLanes.filter((pl) => !pl.lane.isProjectPlan), [packedLanes]);

  const gateRowHeight = GATES_ROW_BASE_HEIGHT + (gateRowLevels - 1) * GATE_SHIFT_PX;
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
    onCreatePhase?.(laneId, start, end);
    setDragCreate(null);
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
    const height = Math.max(laneRowHeight(rows.length), labelHeights[lane.id] ?? 0);
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
    const height = Math.max(laneRowHeight(rows.length), labelHeights[lane.id] ?? 0);
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
        onClick={creatable ? (e) => handleTrackClick(e, lane.id) : undefined}
        onMouseMove={creatable ? (e) => handleLaneHover(e, lane.id) : undefined}
        onMouseLeave={creatable ? () => setHoverCell(null) : undefined}
      >
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
              />
            ))}
          </div>
        ))}
        {hoverCell && hoverCell.laneId === lane.id && !dragCreate && (
          <div
            className={styles.hoverCellHighlight}
            style={{ left: pct(hoverCell.start, scale), width: pctSpan(hoverCell.start, hoverCell.end, scale) }}
          />
        )}
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
          {planPackedLanes.map(renderLaneLabel)}
          <div
            className={`${styles.labelCell} ${styles.gatesLabelCell}`}
            style={{ height: gateRowHeight }}
          >
            {/* Same left indent as a lane row's own leading elements (drag
                handle + add-below button, whichever the caller actually
                renders) and the same laneLabelText styling, so "Stage
                gates" reads as one more row in the same list rather than a
                visually distinct heading. */}
            {onGatesLabelClick ? (
              <button type="button" className={styles.gatesLabelButton} onClick={onGatesLabelClick}>
                {onReorderLanes && <span className={styles.dragHandleSpacer} aria-hidden="true" />}
                {onAddLaneBelow && <span className={styles.gatesLabelSpacer} aria-hidden="true" />}
                <span className={styles.laneLabelText}>{strings.stageGates}</span>
              </button>
            ) : (
              <>
                {onReorderLanes && <span className={styles.dragHandleSpacer} aria-hidden="true" />}
                {onAddLaneBelow && <span className={styles.gatesLabelSpacer} aria-hidden="true" />}
                <span className={styles.laneLabelText}>{strings.stageGates}</span>
              </>
            )}
          </div>
          {teamPackedLanes.map(renderLaneLabel)}
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

            {planPackedLanes.map(renderLaneTrack)}

            <div className={styles.gatesTrack} style={{ height: gateRowHeight }}>
              {sortedGates.map((gate) => {
                const active = activeGateIds.has(gate.id);
                return (
                  <button
                    key={gate.id}
                    type="button"
                    className={`${styles.gate} ${active ? styles.gateActive : ""}`}
                    style={{ left: pct(gate.position, scale), top: gateOffsets[gate.id] }}
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

            {teamPackedLanes.map(renderLaneTrack)}

            {/* Top overlay — last in DOM so it paints above every bar, gate
                and ruler cell (all of which are `position: relative` and
                therefore share this same paint tier, ordered by DOM
                position). Kept separate from bandsOverlay, which is first
                in DOM specifically so period bands stay *behind* everything.
                Holds both Focus Cell's highlight and active stage-gate
                lines — unrelated features, same "always on top" need. */}
            <div className={styles.focusOverlay} aria-hidden="true">
              {showToday && todayPosition !== null && <div className={styles.todayLine} style={{ left: pct(todayPosition, scale) }} />}
              {sortedGates
                .filter((g) => activeGateIds.has(g.id))
                .map((g) => (
                  <div
                    key={g.id}
                    className={styles.gateLine}
                    style={{
                      left: pct(g.position, scale),
                      // Starts below this gate's own diamond+label row
                      // (which may be shifted down by collision avoidance),
                      // not at the top of the whole gates track — otherwise
                      // the line cuts across the icon/label instead of
                      // growing out from underneath it.
                      top: BADGE_STRIP_HEIGHT + rulerHeight + (gateOffsets[g.id] ?? 0) + GATE_SHIFT_PX,
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
}: {
  phase: Phase;
  scale: DayScale;
  trackWidth: number;
  selected: boolean;
  onClick?: (phaseId: string) => void;
  onHover: (e: { clientX: number; clientY: number }, data: Omit<TooltipState, "x" | "y">) => void;
  onLeave: () => void;
}) {
  const spanDays = axisToDays(phase.end, scale) - axisToDays(phase.start, scale);
  const widthPx = trackWidth ? (spanDays / scale.totalDays) * trackWidth : Infinity;
  const showText = widthPx >= BAR_MIN_TEXT_PX;

  return (
    <button
      type="button"
      className={[
        styles.bar,
        phase.warning ? styles.statusWarning : STATUS_CLASS[phase.status],
        selected ? styles.barSelected : "",
        showText ? "" : styles.barNoText,
      ].join(" ").trim()}
      style={{ left: pct(phase.start, scale), width: pctSpan(phase.start, phase.end, scale) }}
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
      {showText && phase.warning && (
        <span className={styles.barWarningIcon} aria-hidden="true">
          <IconWarning />
        </span>
      )}
    </button>
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
  /** How many of the canvas's own rows are currently at each status — see
   * legendCounts above. Renders as a small rounded-square badge per item,
   * showing 0 rather than hiding the item when a status has no rows (this
   * replaced the Program page's separate "N projects · X at risk…" strip,
   * which used to hide empty statuses instead). */
  counts: Record<PhaseStatus, number>;
}) {
  const items: PhaseStatus[] = ["done", "in_progress", "at_risk", "not_started"];
  return (
    <div className={styles.legend}>
      {items.map((status) => (
        <span key={status} className={styles.legendItem}>
          <span className={styles.legendDot} style={{ background: `var(--${legendColorVar(status)})` }} />
          {statusLabels[status]}
          <span
            className={styles.legendCount}
            style={{
              background: `color-mix(in srgb, var(--${legendColorVar(status)}) 18%, var(--color-surface))`,
              color: `var(--${legendColorVar(status)}-ink, var(--${legendColorVar(status)}))`,
            }}
          >
            {counts[status]}
          </span>
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

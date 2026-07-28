"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { packLane } from "./pack";
import { fromAxis, toAxis } from "./toAxis";
import type { Lane, Phase, PhaseStatus, PoapRendererProps } from "./types";
import {
  BAR_HEIGHT,
  BAR_MIN_TEXT_PX,
  GATES_ROW_BASE_HEIGHT,
  GATE_COLLISION_PX,
  GATE_SHIFT_PX,
  LABEL_COL_WIDTH,
  LANE_PADDING_Y,
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

const MONTH_ABBR = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

const STATUS_CLASS: Record<PhaseStatus, string> = {
  done: styles.statusDone!,
  in_progress: styles.statusInProgress!,
  at_risk: styles.statusAtRisk!,
  not_started: styles.statusNotStarted!,
};

const STATUS_LABEL: Record<PhaseStatus, string> = {
  done: "Completado",
  in_progress: "En curso",
  at_risk: "En riesgo",
  not_started: "No iniciado",
};

const STATUS_RANK: Record<PhaseStatus, number> = {
  at_risk: 3,
  in_progress: 2,
  not_started: 1,
  done: 0,
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

/**
 * A gate's `position` is the exact instant its day starts — rendering it
 * there puts the marker right on the boundary line between that day and
 * the previous one, at the far *left* edge of its own day column, while
 * the day cell's number sits at the column's midpoint (subCell/monthCell
 * center their label). That mismatch is invisible at coarse zooms (half a
 * day is sub-pixel) but very visible at "dia" zoom — the marker reads as
 * "yesterday". Nudging by half a day lines the gate up with the day
 * column's actual visual center, matching where its number is printed.
 */
function daysCenterOf(position: number, scale: DayScale): number {
  return axisToDays(position, scale) + 0.5;
}
function pctDayCenter(position: number, scale: DayScale): string {
  return `${(daysCenterOf(position, scale) / scale.totalDays) * 100}%`;
}

interface MonthSegment {
  label: string;
  startIdx: number;
}

function monthSegments(startMonth: string, months: number): MonthSegment[] {
  const parts = startMonth.split("-").map(Number);
  const startMonthNum = parts[1] ?? 1;
  return Array.from({ length: months }, (_, i) => {
    const idx = (startMonthNum - 1 + i) % 12;
    return { label: MONTH_ABBR[idx]!.toUpperCase(), startIdx: i };
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
  label: number;
}

/**
 * Cells for the ruler's third row — one per week (a 7-day bucket from the
 * 1st of startMonth, not calendar-aligned to Mondays) or one per calendar
 * day, matching the grid Excel drew: divisions at each cell's start/end,
 * the label centered inside the cell rather than pinned to an edge.
 */
function subCells(startMonth: string, months: number, granularity: SubRowGranularity): SubCell[] {
  if (granularity === "none") return [];
  const parts = startMonth.split("-").map(Number);
  const y = parts[0] ?? 0;
  const m = parts[1] ?? 1;
  const rangeStart = new Date(Date.UTC(y, m - 1, 1));
  const rangeEnd = new Date(Date.UTC(y, m - 1 + months, 1));
  const stepDays = granularity === "day" ? 1 : 7;

  const cells: SubCell[] = [];
  for (
    let d = rangeStart;
    d < rangeEnd;
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + stepDays))
  ) {
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + stepDays));
    cells.push({ start: toAxis(d, startMonth), end: toAxis(next, startMonth), label: d.getUTCDate() });
  }
  return cells;
}

type ColumnUnit = "day" | "week" | "month";

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
  // month
  const start = Math.floor(rawPosition);
  return { start, end: start + 1 };
}

function formatColumnLabel(range: ColumnRange, unit: ColumnUnit, startMonth: string): string {
  const start = fromAxis(range.start, startMonth);
  if (unit === "day") {
    return `${start.getUTCDate()} ${MONTH_ABBR[start.getUTCMonth()]} ${String(start.getUTCFullYear()).slice(2)}`;
  }
  if (unit === "week") {
    return `Semana del ${start.getUTCDate()} ${MONTH_ABBR[start.getUTCMonth()]}`;
  }
  return `${MONTH_ABBR[start.getUTCMonth()]!.charAt(0).toUpperCase()}${MONTH_ABBR[start.getUTCMonth()]!.slice(1)} ${start.getUTCFullYear()}`;
}

function laneRowHeight(rowCount: number): number {
  const rows = Math.max(rowCount, 1);
  return LANE_PADDING_Y * 2 + rows * BAR_HEIGHT + (rows - 1) * ROW_GAP;
}

interface LaneAggregate {
  start: number;
  end: number;
  status: PhaseStatus;
  owners: string[];
  phaseCount: number;
}

function aggregateLane(lane: Lane): LaneAggregate {
  const phases = lane.phases;
  if (phases.length === 0) {
    return { start: 0, end: 0, status: "not_started", owners: [], phaseCount: 0 };
  }
  const active = phases.filter((p) => p.status !== "done");
  const pool = active.length ? active : phases;
  let status = pool[0]!.status;
  for (const p of pool) if (STATUS_RANK[p.status] > STATUS_RANK[status]) status = p.status;
  if (!active.length) status = "done";

  return {
    start: Math.min(...phases.map((p) => p.start)),
    end: Math.max(...phases.map((p) => p.end)),
    status,
    owners: Array.from(new Set(phases.flatMap((p) => p.owners ?? []))),
    phaseCount: phases.length,
  };
}

function formatAxisDate(position: number, startMonth: string): string {
  const d = fromAxis(position, startMonth);
  return `${d.getUTCDate()} ${MONTH_ABBR[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`;
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
 * Zoom, zoom-scale, Focus Cell and lane-collapse are internal UI state, not
 * props — all four are purely about how this data gets displayed, not what
 * the data is. Zoom (Año/Mes/Semana/Día) changes the ruler's structure —
 * what the third row divides into, if anything; zoomScale is a continuous
 * multiplier on top of that (Excel-style +/- stepper) that only changes
 * column width, not structure. Collapsing a lane swaps its packed rows for
 * one aggregate summary bar (aggregateLane).
 *
 * All horizontal placement goes through a DayScale (buildDayScale) so every
 * calendar day gets the same pixel width regardless of which month it's
 * in — see the comment on buildDayScale.
 *
 * Responsive strategy unchanged: the label column is a fixed-width flex
 * sibling that never scrolls; the timeline is a separate scroll container.
 * Label and timeline rows are synced by giving both an identical, explicitly
 * computed height rather than relying on a shared grid.
 */
export function PoapRenderer({
  months,
  startMonth,
  lanes,
  gates = [],
  bands = [],
  selectedPhaseId = null,
  onPhaseClick,
}: PoapRendererProps) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [trackWidth, setTrackWidth] = useState(0);
  const [zoomKey, setZoomKey] = useState<ZoomLevel["key"]>("anio");
  const [zoomScale, setZoomScale] = useState(ZOOM_SCALE_DEFAULT);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [gateTooltip, setGateTooltip] = useState<GateTooltipState | null>(null);
  const [selectedColumn, setSelectedColumn] = useState<{ range: ColumnRange; unit: ColumnUnit } | null>(null);
  const [activeGateIds, setActiveGateIds] = useState<Set<string>>(() => new Set());

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
      const x = (daysCenterOf(gate.position, scale) / scale.totalDays) * effectiveWidth;
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

  const mSegments = useMemo(() => monthSegments(startMonth, months), [startMonth, months]);
  const ySegments = useMemo(() => yearSegments(startMonth, months), [startMonth, months]);
  const sCells = useMemo(
    () => subCells(startMonth, months, zoom.subRowGranularity),
    [startMonth, months, zoom.subRowGranularity],
  );

  const orderedLanes = useMemo(
    () => [...lanes].sort((a, b) => a.sortOrder - b.sortOrder),
    [lanes],
  );
  const packedLanes = useMemo(
    () =>
      orderedLanes.map((lane) => ({
        lane,
        rows: collapsed.has(lane.id) ? null : packLane(lane.phases),
      })),
    [orderedLanes, collapsed],
  );

  const gateRowHeight = GATES_ROW_BASE_HEIGHT + (gateRowLevels - 1) * GATE_SHIFT_PX;
  const rulerHeight = YEAR_ROW_HEIGHT + MONTH_ROW_HEIGHT + (zoom.subRowGranularity !== "none" ? SUB_ROW_HEIGHT : 0);

  // A phase "touches" the focused column if their ranges overlap at all —
  // counted against every phase in the program, regardless of whether its
  // lane is currently collapsed, since the count describes the underlying
  // plan, not what's currently on screen.
  const touchedCount = useMemo(() => {
    if (selectedColumn === null) return 0;
    const { range } = selectedColumn;
    return orderedLanes
      .flatMap((l) => l.phases)
      .filter((p) => p.start < range.end && p.end > range.start).length;
  }, [orderedLanes, selectedColumn]);

  function toggleLane(laneId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(laneId)) next.delete(laneId);
      else next.add(laneId);
      return next;
    });
  }

  function selectZoom(key: ZoomLevel["key"]) {
    setZoomKey(key);
    setZoomScale(ZOOM_SCALE_DEFAULT);
    // A focused column is only meaningful relative to the grid it was
    // picked on — zooming changes what the columns even are, so a stale
    // range from the old grid would no longer land on a real boundary.
    setSelectedColumn(null);
  }

  function nudgeZoomScale(delta: number) {
    setZoomScale((prev) => Math.round(Math.min(ZOOM_SCALE_MAX, Math.max(ZOOM_SCALE_MIN, prev + delta)) * 100) / 100);
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

  function showTooltip(e: { clientX: number; clientY: number }, data: Omit<TooltipState, "x" | "y">) {
    setTooltip({ ...data, x: e.clientX, y: e.clientY });
  }

  // Stage gates activate independently of each other (unlike Focus Cell,
  // which is a single selection) — the point is comparing several at once
  // to see which phases each one cuts through.
  function toggleGate(gateId: string) {
    setActiveGateIds((prev) => {
      const next = new Set(prev);
      if (next.has(gateId)) next.delete(gateId);
      else next.add(gateId);
      return next;
    });
  }

  function showGateTooltip(e: { clientX: number; clientY: number }, gate: { label: string; position: number }) {
    setGateTooltip({ x: e.clientX, y: e.clientY, label: gate.label, date: formatAxisDate(gate.position, startMonth) });
  }

  return (
    <div className={styles.card}>
      <div className={styles.toolbar}>
        <Legend />
        <div className={styles.toolbarControls}>
          <div className={styles.scaleGroup} role="group" aria-label="Zoom continuo">
            <button
              type="button"
              className={styles.scaleButton}
              onClick={() => nudgeZoomScale(-ZOOM_SCALE_STEP)}
              disabled={zoomScale <= ZOOM_SCALE_MIN}
              aria-label="Reducir zoom"
            >
              −
            </button>
            <span className={styles.scaleValue}>{Math.round(zoomScale * 100)}%</span>
            <button
              type="button"
              className={styles.scaleButton}
              onClick={() => nudgeZoomScale(ZOOM_SCALE_STEP)}
              disabled={zoomScale >= ZOOM_SCALE_MAX}
              aria-label="Aumentar zoom"
            >
              +
            </button>
          </div>
          <div className={styles.zoomGroup} role="group" aria-label="Nivel de zoom temporal">
            {ZOOM_LEVELS.map((z) => (
              <button
                key={z.key}
                type="button"
                className={`${styles.zoomButton} ${z.key === zoomKey ? styles.zoomButtonActive : ""}`}
                onClick={() => selectZoom(z.key)}
              >
                {z.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.chart}>
        <div className={styles.labelsCol} style={{ width: LABEL_COL_WIDTH }}>
          <div className={styles.labelCell} style={{ height: rulerHeight }} />
          <div
            className={`${styles.labelCell} ${styles.gatesLabelCell}`}
            style={{ height: gateRowHeight }}
          >
            Stage gates
          </div>
          {packedLanes.map(({ lane, rows }) => {
            const isCollapsed = rows === null;
            const height = laneRowHeight(isCollapsed ? 1 : rows.length);
            return (
              <button
                key={lane.id}
                type="button"
                className={`${styles.labelCell} ${styles.laneLabel}`}
                style={{ height }}
                onClick={() => toggleLane(lane.id)}
                aria-expanded={!isCollapsed}
              >
                <span className={`${styles.chevron} ${isCollapsed ? styles.chevronCollapsed : ""}`} aria-hidden="true">
                  ▾
                </span>
                <span className={styles.laneLabelText}>{lane.name}</span>
              </button>
            );
          })}
        </div>

        <div ref={timelineRef} className={styles.timelineScroll}>
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
              {Array.from({ length: months + 1 }, (_, i) => (
                <div key={`m${i}`} className={styles.monthGridLine} style={{ left: pct(i, scale) }} />
              ))}
              {sCells.map((cell, i) => (
                <div key={`s${i}`} className={styles.subGridLine} style={{ left: pct(cell.start, scale) }} />
              ))}
            </div>

            <div className={styles.ruler} style={{ height: rulerHeight }}>
              <div className={styles.yearRow} style={{ height: YEAR_ROW_HEIGHT }}>
                {ySegments.map((seg) => (
                  <div
                    key={seg.year}
                    className={styles.yearCell}
                    style={{ left: pct(seg.startIdx, scale), width: pctSpan(seg.startIdx, seg.startIdx + seg.span, scale) }}
                  >
                    {seg.year}
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
                    {seg.label}
                  </div>
                ))}
              </div>
              {zoom.subRowGranularity !== "none" && (
                <div
                  className={styles.subRow}
                  style={{ height: SUB_ROW_HEIGHT }}
                  onClick={(e) => focusColumn(e, zoom.subRowGranularity as ColumnUnit)}
                >
                  {sCells.map((cell, i) => (
                    <div
                      key={i}
                      className={styles.subCell}
                      style={{ left: pct(cell.start, scale), width: pctSpan(cell.start, cell.end, scale) }}
                    >
                      {cell.label}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className={styles.gatesTrack} style={{ height: gateRowHeight }}>
              {sortedGates.map((gate) => {
                const active = activeGateIds.has(gate.id);
                return (
                  <button
                    key={gate.id}
                    type="button"
                    className={`${styles.gate} ${active ? styles.gateActive : ""}`}
                    style={{ left: pctDayCenter(gate.position, scale), top: gateOffsets[gate.id] }}
                    onClick={() => toggleGate(gate.id)}
                    onMouseMove={(e) => showGateTooltip(e, gate)}
                    onMouseLeave={() => setGateTooltip(null)}
                    aria-pressed={active}
                  >
                    <span className={styles.gateDiamond} aria-hidden="true" />
                    <span className={styles.gateLabel}>{gate.label}</span>
                  </button>
                );
              })}
            </div>

            {packedLanes.map(({ lane, rows }) => {
              if (rows === null) {
                const agg = aggregateLane(lane);
                const height = laneRowHeight(1);
                return (
                  <div key={lane.id} className={styles.laneTrack} style={{ height }}>
                    <div className={styles.laneRow}>
                      <AggregateBar
                        agg={agg}
                        laneName={lane.name}
                        scale={scale}
                        onHover={showTooltip}
                        onLeave={() => setTooltip(null)}
                      />
                    </div>
                  </div>
                );
              }
              return (
                <div key={lane.id} className={styles.laneTrack} style={{ height: laneRowHeight(rows.length) }}>
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
                </div>
              );
            })}

            {/* Top overlay — last in DOM so it paints above every bar, gate
                and ruler cell (all of which are `position: relative` and
                therefore share this same paint tier, ordered by DOM
                position). Kept separate from bandsOverlay, which is first
                in DOM specifically so period bands stay *behind* everything.
                Holds both Focus Cell's highlight and active stage-gate
                lines — unrelated features, same "always on top" need. */}
            <div className={styles.focusOverlay} aria-hidden="true">
              {sortedGates
                .filter((g) => activeGateIds.has(g.id))
                .map((g) => (
                  <div key={g.id} className={styles.gateLine} style={{ left: pctDayCenter(g.position, scale), top: rulerHeight }} />
                ))}
              {selectedColumn !== null && (
                <>
                  <div
                    className={styles.columnHighlight}
                    style={{
                      left: pct(selectedColumn.range.start, scale),
                      width: pctSpan(selectedColumn.range.start, selectedColumn.range.end, scale),
                    }}
                  />
                  <div
                    className={styles.columnBadge}
                    style={{ left: pct(selectedColumn.range.start, scale), top: rulerHeight }}
                  >
                    {formatColumnLabel(selectedColumn.range, selectedColumn.unit, startMonth)} · {touchedCount}{" "}
                    {touchedCount === 1 ? "fase" : "fases"}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {tooltip && <Tooltip data={tooltip} startMonth={startMonth} />}
      {gateTooltip && <GateTooltip data={gateTooltip} />}
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
        STATUS_CLASS[phase.status],
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
    >
      {showText && <span className={styles.barLabel}>{phase.title}</span>}
    </button>
  );
}

function AggregateBar({
  agg,
  laneName,
  scale,
  onHover,
  onLeave,
}: {
  agg: LaneAggregate;
  laneName: string;
  scale: DayScale;
  onHover: (e: { clientX: number; clientY: number }, data: Omit<TooltipState, "x" | "y">) => void;
  onLeave: () => void;
}) {
  return (
    <div
      className={`${styles.bar} ${STATUS_CLASS[agg.status]}`}
      style={{ left: pct(agg.start, scale), width: pctSpan(agg.start, agg.end, scale), cursor: "default" }}
      onMouseMove={(e) =>
        onHover(e, {
          title: `${laneName} — resumen`,
          start: agg.start,
          end: agg.end,
          owners: agg.owners,
          status: agg.status,
        })
      }
      onMouseLeave={onLeave}
    >
      <span className={styles.barLabel}>Resumen — {agg.phaseCount} fases</span>
    </div>
  );
}

function Tooltip({ data, startMonth }: { data: TooltipState; startMonth: string }) {
  return (
    <div className={styles.tooltip} style={{ left: data.x + 14, top: data.y + 14 }}>
      <p className={styles.tooltipTitle}>{data.title}</p>
      <div className={styles.tooltipRow}>
        <span>Inicio</span>
        <b>{formatAxisDate(data.start, startMonth)}</b>
      </div>
      <div className={styles.tooltipRow}>
        <span>Fin</span>
        <b>{formatAxisDate(data.end, startMonth)}</b>
      </div>
      <div className={styles.tooltipRow}>
        <span>Involucrados</span>
        <b>{data.owners.length ? data.owners.join(", ") : "—"}</b>
      </div>
      <div className={styles.tooltipStatus}>
        <span className={styles.tooltipDot} style={{ background: `var(--${legendColorVar(data.status)})` }} />
        {STATUS_LABEL[data.status]}
      </div>
    </div>
  );
}

function GateTooltip({ data }: { data: GateTooltipState }) {
  return (
    <div className={styles.tooltip} style={{ left: data.x + 14, top: data.y + 14 }}>
      <p className={styles.tooltipTitle}>{data.label}</p>
      <div className={styles.tooltipRow}>
        <span>Fecha</span>
        <b>{data.date}</b>
      </div>
    </div>
  );
}

function Legend() {
  const items: PhaseStatus[] = ["done", "in_progress", "at_risk", "not_started"];
  return (
    <div className={styles.legend}>
      {items.map((status) => (
        <span key={status} className={styles.legendItem}>
          <span className={styles.legendDot} style={{ background: `var(--${legendColorVar(status)})` }} />
          {STATUS_LABEL[status]}
        </span>
      ))}
    </div>
  );
}

function legendColorVar(status: PhaseStatus): string {
  switch (status) {
    case "done": return "text-success";
    case "in_progress": return "text-accent";
    case "at_risk": return "text-warning";
    case "not_started": return "text-secondary";
  }
}

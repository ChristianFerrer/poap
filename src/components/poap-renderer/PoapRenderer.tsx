"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
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
  WEEK_ROW_HEIGHT,
  YEAR_ROW_HEIGHT,
  ZOOM_LEVELS,
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

function monthLabels(startMonth: string, months: number): string[] {
  const parts = startMonth.split("-").map(Number);
  const startMonthNum = parts[1] ?? 1;
  return Array.from({ length: months }, (_, i) => {
    const idx = (startMonthNum - 1 + i) % 12;
    return MONTH_ABBR[idx]!.toUpperCase();
  });
}

function yearSegments(startMonth: string, months: number): { year: number; startIdx: number; span: number }[] {
  const parts = startMonth.split("-").map(Number);
  const startYear = parts[0] ?? 0;
  const startMonthNum = parts[1] ?? 1;
  const segments: { year: number; startIdx: number; span: number }[] = [];
  for (let i = 0; i < months; i++) {
    const absoluteMonth = startMonthNum - 1 + i;
    const year = startYear + Math.floor(absoluteMonth / 12);
    const last = segments[segments.length - 1];
    if (last && last.year === year) last.span += 1;
    else segments.push({ year, startIdx: i, span: 1 });
  }
  return segments;
}

/** One tick every 7 days from the 1st of startMonth — not calendar-aligned
 * to Mondays, just evenly spaced "start of week" markers along the axis. */
function weekTicks(startMonth: string, months: number): { position: number; day: number }[] {
  const parts = startMonth.split("-").map(Number);
  const y = parts[0] ?? 0;
  const m = parts[1] ?? 1;
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m - 1 + months, 1));
  const ticks: { position: number; day: number }[] = [];
  for (let d = start; d < end; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 7))) {
    ticks.push({ position: toAxis(d, startMonth), day: d.getUTCDate() });
  }
  return ticks;
}

function pct(value: number, months: number): string {
  return `${(value / months) * 100}%`;
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

/**
 * Renders a program's PoAP grid: lanes with auto-stacked phase rows, a
 * stage-gate strip, and period bands. Pure presentational component — no
 * data fetching, no routing. Row counts per lane come from `packLane`
 * (src/components/poap-renderer/pack.ts); this component never decides how
 * phases get grouped into rows, only how a given row layout gets painted.
 *
 * Zoom and lane-collapse are internal UI state, not props — both are purely
 * about how this data gets displayed, not what the data is, so they don't
 * belong in the parent's state. Zoom changes only the px-per-month floor
 * (which dates are in range never changes); collapsing a lane swaps its
 * packed rows for one aggregate summary bar (aggregateLane).
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
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const zoom = ZOOM_LEVELS.find((z) => z.key === zoomKey) ?? ZOOM_LEVELS[0]!;

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

  const timelineMinWidth = months * zoom.pxPerMonth;
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
      const x = (gate.position / months) * effectiveWidth;
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
  }, [sortedGates, effectiveWidth, months]);

  const mLabels = useMemo(() => monthLabels(startMonth, months), [startMonth, months]);
  const ySegments = useMemo(() => yearSegments(startMonth, months), [startMonth, months]);
  const wTicks = useMemo(
    () => (zoom.showWeekRow ? weekTicks(startMonth, months) : []),
    [startMonth, months, zoom.showWeekRow],
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
  const rulerHeight = YEAR_ROW_HEIGHT + MONTH_ROW_HEIGHT + (zoom.showWeekRow ? WEEK_ROW_HEIGHT : 0);

  function toggleLane(laneId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(laneId)) next.delete(laneId);
      else next.add(laneId);
      return next;
    });
  }

  function showTooltip(e: { clientX: number; clientY: number }, data: Omit<TooltipState, "x" | "y">) {
    setTooltip({ ...data, x: e.clientX, y: e.clientY });
  }

  return (
    <div className={styles.card}>
      <div className={styles.toolbar}>
        <div className={styles.zoomGroup} role="group" aria-label="Nivel de zoom temporal">
          {ZOOM_LEVELS.map((z) => (
            <button
              key={z.key}
              type="button"
              className={`${styles.zoomButton} ${z.key === zoomKey ? styles.zoomButtonActive : ""}`}
              onClick={() => setZoomKey(z.key)}
            >
              {z.label}
            </button>
          ))}
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
                  style={{ left: pct(band.start, months), width: pct(band.end - band.start, months) }}
                  title={band.label}
                />
              ))}
            </div>

            <div className={styles.ruler} style={{ height: rulerHeight }}>
              <div className={styles.yearRow} style={{ height: YEAR_ROW_HEIGHT }}>
                {ySegments.map((seg) => (
                  <div
                    key={seg.year}
                    className={styles.yearCell}
                    style={{ left: pct(seg.startIdx, months), width: pct(seg.span, months) }}
                  >
                    {seg.year}
                  </div>
                ))}
              </div>
              <div
                className={styles.monthHeader}
                style={{ height: MONTH_ROW_HEIGHT, gridTemplateColumns: `repeat(${months}, 1fr)` }}
              >
                {mLabels.map((label, i) => (
                  <div key={i} className={styles.monthCell}>{label}</div>
                ))}
              </div>
              {zoom.showWeekRow && (
                <div className={styles.weekRow} style={{ height: WEEK_ROW_HEIGHT }}>
                  {wTicks.map((tick, i) => (
                    <div key={i} className={styles.weekTick} style={{ left: pct(tick.position, months) }}>
                      {tick.day}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className={styles.gatesTrack} style={{ height: gateRowHeight }}>
              {sortedGates.map((gate) => (
                <div
                  key={gate.id}
                  className={styles.gate}
                  style={{ left: pct(gate.position, months), top: gateOffsets[gate.id] }}
                >
                  <span className={styles.gateDiamond} aria-hidden="true" />
                  <span className={styles.gateLabel}>{gate.label}</span>
                </div>
              ))}
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
                        months={months}
                        onHover={showTooltip}
                        onLeave={() => setTooltip(null)}
                      />
                    </div>
                  </div>
                );
              }
              return (
                <div key={lane.id} className={styles.laneTrack} style={{ height: laneRowHeight(rows.length) }}>
                  {rows.map((row, i) => (
                    <div key={i} className={styles.laneRow}>
                      {row.map((phase) => (
                        <Bar
                          key={phase.id}
                          phase={phase}
                          months={months}
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
          </div>
        </div>
      </div>

      <Legend />

      {tooltip && <Tooltip data={tooltip} startMonth={startMonth} />}
    </div>
  );
}

function Bar({
  phase,
  months,
  trackWidth,
  selected,
  onClick,
  onHover,
  onLeave,
}: {
  phase: Phase;
  months: number;
  trackWidth: number;
  selected: boolean;
  onClick?: (phaseId: string) => void;
  onHover: (e: { clientX: number; clientY: number }, data: Omit<TooltipState, "x" | "y">) => void;
  onLeave: () => void;
}) {
  const widthPx = trackWidth ? ((phase.end - phase.start) / months) * trackWidth : Infinity;
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
      style={{ left: pct(phase.start, months), width: pct(phase.end - phase.start, months) }}
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
  months,
  onHover,
  onLeave,
}: {
  agg: LaneAggregate;
  laneName: string;
  months: number;
  onHover: (e: { clientX: number; clientY: number }, data: Omit<TooltipState, "x" | "y">) => void;
  onLeave: () => void;
}) {
  return (
    <div
      className={`${styles.bar} ${STATUS_CLASS[agg.status]}`}
      style={{ left: pct(agg.start, months), width: pct(agg.end - agg.start, months), cursor: "default" }}
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

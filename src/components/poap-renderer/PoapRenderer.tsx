"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { packLane } from "./pack";
import type { Phase, PhaseStatus, PoapRendererProps } from "./types";
import {
  BAR_HEIGHT,
  BAR_MIN_TEXT_PX,
  GATES_ROW_BASE_HEIGHT,
  GATE_COLLISION_PX,
  GATE_SHIFT_PX,
  HEADER_ROW_HEIGHT,
  LABEL_COL_WIDTH,
  LANE_PADDING_Y,
  MIN_MONTH_PX,
  ROW_GAP,
} from "./constants";
import styles from "./PoapRenderer.module.css";

const MONTH_ABBR = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];
const MONTH_INITIAL = ["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

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

function monthLabels(startMonth: string, months: number): string[] {
  const parts = startMonth.split("-").map(Number);
  const startMonthNum = parts[1] ?? 1;
  const useInitials = months > 8;
  const table = useInitials ? MONTH_INITIAL : MONTH_ABBR;
  return Array.from({ length: months }, (_, i) => {
    const idx = (startMonthNum - 1 + i) % 12;
    return table[idx]!;
  });
}

function pct(value: number, months: number): string {
  return `${(value / months) * 100}%`;
}

function laneRowHeight(rowCount: number): number {
  const rows = Math.max(rowCount, 1);
  return LANE_PADDING_Y * 2 + rows * BAR_HEIGHT + (rows - 1) * ROW_GAP;
}

/**
 * Renders a program's PoAP grid: lanes with auto-stacked phase rows, a
 * stage-gate strip, and period bands. Pure presentational component — no
 * data fetching, no routing. Row counts per lane come from `packLane`
 * (src/components/poap-renderer/pack.ts); this component never decides how
 * phases get grouped into rows, only how a given row layout gets painted.
 *
 * Responsive strategy: the label column is a fixed-width flex sibling that
 * never scrolls; the timeline is a separate scroll container with a
 * per-month width floor (MIN_MONTH_PX), so on a narrow viewport it scrolls
 * horizontally instead of compressing bar text into nothing. Label and
 * timeline rows are synced by giving both an identical, explicitly computed
 * height rather than relying on the two staying in a shared grid.
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

  const timelineMinWidth = months * MIN_MONTH_PX;
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
  // that fits" idea as packLane. Comparing only to the immediately-previous
  // gate (rather than the last gate actually placed in each row) let two
  // gates that were both close to a third end up stacked on top of each
  // other — this fixes that by tracking one "last x" per row. The spec only
  // asks for a single 14px drop, but a third row falls out for free if three
  // gates land within 60px of each other, which is worth keeping over a
  // silent overlap. Needs the real rendered width, not the % axis, since the
  // 60px threshold is a physical distance.
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

  const labels = useMemo(() => monthLabels(startMonth, months), [startMonth, months]);

  const orderedLanes = useMemo(
    () => [...lanes].sort((a, b) => a.sortOrder - b.sortOrder),
    [lanes],
  );
  const packedLanes = useMemo(
    () => orderedLanes.map((lane) => ({ lane, rows: packLane(lane.phases) })),
    [orderedLanes],
  );

  const gateRowHeight = GATES_ROW_BASE_HEIGHT + (gateRowLevels - 1) * GATE_SHIFT_PX;

  return (
    <div className={styles.card}>
      <div className={styles.chart}>
        <div className={styles.labelsCol} style={{ width: LABEL_COL_WIDTH }}>
          <div className={styles.labelCell} style={{ height: HEADER_ROW_HEIGHT }} />
          <div
            className={`${styles.labelCell} ${styles.gatesLabelCell}`}
            style={{ height: gateRowHeight }}
          >
            Stage gates
          </div>
          {packedLanes.map(({ lane, rows }) => (
            <div
              key={lane.id}
              className={`${styles.labelCell} ${styles.laneLabel}`}
              style={{ height: laneRowHeight(rows.length) }}
              title={lane.name}
            >
              <span className={styles.laneLabelText}>{lane.name}</span>
            </div>
          ))}
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

            <div
              className={styles.monthHeader}
              style={{ height: HEADER_ROW_HEIGHT, gridTemplateColumns: `repeat(${months}, 1fr)` }}
            >
              {labels.map((label, i) => (
                <div key={i} className={styles.monthCell}>{label}</div>
              ))}
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

            {packedLanes.map(({ lane, rows }) => (
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
                      />
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <Legend />
    </div>
  );
}

function Bar({
  phase,
  months,
  trackWidth,
  selected,
  onClick,
}: {
  phase: Phase;
  months: number;
  trackWidth: number;
  selected: boolean;
  onClick?: (phaseId: string) => void;
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
      title={phase.title}
      onClick={() => onClick?.(phase.id)}
    >
      {showText && <span className={styles.barLabel}>{phase.title}</span>}
    </button>
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

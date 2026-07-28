"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { packLane } from "./pack";
import type { Phase, PhaseStatus, PoapRendererProps } from "./types";
import {
  BAR_MIN_TEXT_PX,
  GATE_COLLISION_PX,
  GATE_SHIFT_PX,
  LABEL_COL_WIDTH,
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

/**
 * Renders a program's PoAP grid: lanes with auto-stacked phase rows, a
 * stage-gate strip, and period bands. Pure presentational component — no
 * data fetching, no routing. Row counts per lane come from `packLane`
 * (src/components/poap-renderer/pack.ts); this component never decides how
 * phases get grouped into rows, only how a given row layout gets painted.
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
  const gatesTrackRef = useRef<HTMLDivElement>(null);
  const [trackWidth, setTrackWidth] = useState(0);

  useLayoutEffect(() => {
    const el = gatesTrackRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setTrackWidth(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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
      const x = trackWidth ? (gate.position / months) * trackWidth : 0;
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
  }, [sortedGates, trackWidth, months]);

  const labels = useMemo(() => monthLabels(startMonth, months), [startMonth, months]);

  const orderedLanes = useMemo(
    () => [...lanes].sort((a, b) => a.sortOrder - b.sortOrder),
    [lanes],
  );
  const packedLanes = useMemo(
    () => orderedLanes.map((lane) => ({ lane, rows: packLane(lane.phases) })),
    [orderedLanes],
  );

  const gateRowHeight = 22 + (gateRowLevels - 1) * GATE_SHIFT_PX;

  // Grid rows are assigned explicitly (not left to auto-placement): row 1 is
  // the month header, row 2 is stage gates, then one row per lane. This has
  // to be explicit because bandsOverlay spans every row in column 2 — if the
  // other column-2 items were auto-placed, the grid would try to resolve
  // their rows *before* it knows how many rows bandsOverlay's span needs,
  // and auto-placement skips any row bandsOverlay has already claimed.
  const HEADER_ROW = 1;
  const GATES_ROW = 2;
  const totalRows = 2 + packedLanes.length;

  return (
    <div className={styles.card}>
      <div
        className={styles.chart}
        style={{ gridTemplateColumns: `${LABEL_COL_WIDTH}px 1fr` }}
      >
        <div
          className={styles.bandsOverlay}
          style={{ gridRow: `1 / ${totalRows + 1}` }}
          aria-hidden="true"
        >
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
          className={`${styles.labelCell} ${styles.headerLabelCell}`}
          style={{ gridColumn: 1, gridRow: HEADER_ROW }}
        />
        <div
          className={styles.monthHeader}
          style={{ gridColumn: 2, gridRow: HEADER_ROW, gridTemplateColumns: `repeat(${months}, 1fr)` }}
        >
          {labels.map((label, i) => (
            <div key={i} className={styles.monthCell}>{label}</div>
          ))}
        </div>

        <div
          className={`${styles.labelCell} ${styles.gatesLabelCell}`}
          style={{ gridColumn: 1, gridRow: GATES_ROW, height: gateRowHeight }}
        >
          Stage gates
        </div>
        <div
          ref={gatesTrackRef}
          className={styles.gatesTrack}
          style={{ gridColumn: 2, gridRow: GATES_ROW, height: gateRowHeight }}
        >
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

        {packedLanes.map(({ lane, rows }, i) => (
          <LaneRow
            key={lane.id}
            gridRow={GATES_ROW + 1 + i}
            name={lane.name}
            rows={rows}
            months={months}
            trackWidth={trackWidth}
            selectedPhaseId={selectedPhaseId}
            onPhaseClick={onPhaseClick}
          />
        ))}
      </div>

      <Legend />
    </div>
  );
}

function LaneRow({
  gridRow,
  name,
  rows,
  months,
  trackWidth,
  selectedPhaseId,
  onPhaseClick,
}: {
  gridRow: number;
  name: string;
  rows: Phase[][];
  months: number;
  trackWidth: number;
  selectedPhaseId: string | null;
  onPhaseClick?: (phaseId: string) => void;
}) {
  return (
    <>
      <div
        className={`${styles.labelCell} ${styles.laneLabel}`}
        style={{ gridColumn: 1, gridRow }}
      >
        <span className={styles.laneLabelText}>{name}</span>
      </div>
      <div className={styles.laneTrack} style={{ gridColumn: 2, gridRow }}>
        {rows.map((row, i) => (
          <div key={i} className={styles.laneRow}>
            {row.map((phase) => (
              <Bar
                key={phase.id}
                phase={phase}
                months={months}
                trackWidth={trackWidth}
                selected={phase.id === selectedPhaseId}
                onClick={onPhaseClick}
              />
            ))}
          </div>
        ))}
      </div>
    </>
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

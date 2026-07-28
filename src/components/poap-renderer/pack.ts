import type { Phase } from "./types";

const EPS = 0.02;

/**
 * Interval-partitioning over a single pool: assigns each phase to the first
 * row whose members all clear it in time (within EPS). Sorting by `start`
 * first is what makes this deterministic — without it the result depends on
 * insertion order and the layout reshuffles between renders.
 */
function packOverlaps(phases: Phase[]): Phase[][] {
  const rows: Phase[][] = [];
  const sorted = [...phases].sort((a, b) => a.start - b.start);
  for (const p of sorted) {
    const row = rows.find((r) =>
      r.every((q) => p.start >= q.end - EPS || p.end <= q.start + EPS),
    );
    if (row) row.push(p);
    else rows.push([p]);
  }
  return rows;
}

/**
 * Packs a lane's phases into rows for rendering.
 *
 * Phases sharing a `subLane` never enter the automatic pool: they're grouped
 * and packed among themselves first (so an internal overlap still gets a
 * second row), and those forced rows are emitted before the automatic ones —
 * a semantic grouping (AC1 vs AC2, UK vs PL) stays anchored at the top of the
 * lane instead of being scattered wherever the automatic algorithm would
 * have put it. Groups are ordered by their earliest phase so the result
 * doesn't depend on the order subLanes first appear in the input.
 *
 * This is the only function the renderer touches. If manual row control
 * turns out to be what users want instead of auto-stacking, only this file
 * changes — the renderer just consumes whatever rows come back.
 */
export function packLane(phases: Phase[]): Phase[][] {
  const forcedGroups = new Map<string, Phase[]>();
  const automatic: Phase[] = [];

  for (const phase of phases) {
    if (phase.subLane) {
      const group = forcedGroups.get(phase.subLane) ?? [];
      group.push(phase);
      forcedGroups.set(phase.subLane, group);
    } else {
      automatic.push(phase);
    }
  }

  const orderedGroups = [...forcedGroups.values()].sort(
    (a, b) =>
      Math.min(...a.map((p) => p.start)) - Math.min(...b.map((p) => p.start)),
  );

  const forcedRows = orderedGroups.flatMap(packOverlaps);
  return [...forcedRows, ...packOverlaps(automatic)];
}

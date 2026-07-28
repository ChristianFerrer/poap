import { describe, expect, it } from "vitest";
import { packLane } from "./pack";
import type { Phase } from "./types";

function phase(id: string, start: number, end: number, subLane?: string): Phase {
  return { id, title: id, start, end, status: "in_progress", subLane: subLane ?? null };
}

/** Deterministic PRNG (mulberry32) so the 200-phase test is reproducible. */
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function overlaps(a: Phase, b: Phase): boolean {
  const EPS = 0.02;
  return !(a.start >= b.end - EPS || a.end <= b.start + EPS);
}

describe("packLane — core interval partitioning", () => {
  it("two disjoint phases share one row", () => {
    const rows = packLane([phase("a", 0, 1), phase("b", 1.5, 2)]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveLength(2);
  });

  it("two overlapping phases split into two rows", () => {
    const rows = packLane([phase("a", 0, 2), phase("b", 1, 3)]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveLength(1);
    expect(rows[1]).toHaveLength(1);
  });

  it("a phase ending exactly where the next starts shares one row", () => {
    const rows = packLane([phase("a", 0, 1), phase("b", 1, 2)]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveLength(2);
  });

  it("three mutually overlapping phases need three rows", () => {
    const rows = packLane([phase("a", 0, 3), phase("b", 1, 4), phase("c", 2, 5)]);
    expect(rows).toHaveLength(3);
    rows.forEach((r) => expect(r).toHaveLength(1));
  });

  it("is order-independent: shuffled input yields the same layout as sorted input", () => {
    const sorted = [
      phase("a", 0, 2),
      phase("b", 1, 3),
      phase("c", 2.5, 4),
      phase("d", 5, 6),
    ];
    const shuffled = [sorted[3]!, sorted[1]!, sorted[0]!, sorted[2]!];

    const rowsFromSorted = packLane(sorted);
    const rowsFromShuffled = packLane(shuffled);

    const shape = (rows: Phase[][]) => rows.map((r) => r.map((p) => p.id).sort());
    expect(shape(rowsFromShuffled)).toEqual(shape(rowsFromSorted));
  });

  it("packs 200 random phases with zero in-row collisions", () => {
    const rand = mulberry32(42);
    const phases: Phase[] = Array.from({ length: 200 }, (_, i) => {
      const start = rand() * 24;
      const end = start + rand() * 3 + 0.05;
      return phase(`p${i}`, start, end);
    });

    const rows = packLane(phases);

    // every phase from the input made it into exactly one row
    const packedIds = rows.flat().map((p) => p.id).sort();
    expect(packedIds).toEqual(phases.map((p) => p.id).sort());

    // no two phases in the same row overlap
    for (const row of rows) {
      for (let i = 0; i < row.length; i++) {
        for (let j = i + 1; j < row.length; j++) {
          expect(overlaps(row[i]!, row[j]!)).toBe(false);
        }
      }
    }
  });
});

describe("packLane — forced subLane grouping", () => {
  it("keeps a subLane's phases on their own row, ahead of the automatic rows", () => {
    const rows = packLane([
      phase("auto-1", 0, 1),
      phase("forced-1", 3, 4, "AC1"),
      phase("forced-2", 5, 6, "AC1"),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.map((p) => p.id).sort()).toEqual(["forced-1", "forced-2"]);
    expect(rows[1]!.map((p) => p.id)).toEqual(["auto-1"]);
  });

  it("still splits a subLane into two rows when its own members overlap", () => {
    const rows = packLane([
      phase("forced-1", 0, 3, "AC1"),
      phase("forced-2", 1, 4, "AC1"),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]!).toHaveLength(1);
    expect(rows[1]!).toHaveLength(1);
  });

  it("never merges a subLane phase into the automatic pool, even without overlap", () => {
    const rows = packLane([phase("forced-1", 0, 1, "AC1"), phase("auto-1", 5, 6)]);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.map((p) => p.id)).toEqual(["forced-1"]);
    expect(rows[1]!.map((p) => p.id)).toEqual(["auto-1"]);
  });

  it("orders forced groups by their earliest phase, regardless of input order", () => {
    const rows = packLane([
      phase("late-1", 8, 9, "PL"),
      phase("early-1", 0, 1, "UK"),
    ]);
    expect(rows[0]!.map((p) => p.id)).toEqual(["early-1"]);
    expect(rows[1]!.map((p) => p.id)).toEqual(["late-1"]);
  });
});

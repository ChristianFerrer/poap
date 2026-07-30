import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { listSheetNames, parseSheet } from "./importExcel";

describe("listSheetNames", () => {
  it("returns every worksheet name in order", () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Uno");
    wb.addWorksheet("Dos");
    expect(listSheetNames(wb)).toEqual(["Uno", "Dos"]);
  });
});

const SOLID_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFAABBCC" } } as const;

describe("parseSheet — explicit date row", () => {
  function buildSheet() {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Plan");
    // Row 1: year across the week columns
    ["B1", "C1", "D1", "E1"].forEach((addr) => (ws.getCell(addr).value = 2026));
    // Row 2: weekly date row
    ws.getCell("B2").value = new Date(Date.UTC(2026, 0, 5));
    ws.getCell("C2").value = new Date(Date.UTC(2026, 0, 12));
    ws.getCell("D2").value = new Date(Date.UTC(2026, 0, 19));
    ws.getCell("E2").value = new Date(Date.UTC(2026, 0, 26));
    // Row 3: lane "Team A" + a merged 2-week phase
    ws.getCell("A3").value = "Team A";
    ws.mergeCells("B3:C3");
    ws.getCell("B3").value = "Phase X";
    // Row 4: blank lane cell (forward-fills to "Team A") + a single-week phase
    ws.getCell("D4").value = "Phase Y";
    return ws;
  }

  it("locates phases using the date row and forward-fills the lane name, ending each on the Friday of the week its color ends", () => {
    const result = parseSheet(buildSheet());
    expect(result.warnings).toEqual([]);
    expect(result.lanes).toHaveLength(1);
    expect(result.lanes[0]!.name).toBe("Team A");
    expect(result.lanes[0]!.phases).toEqual([
      // Merge covers Jan 5–18 (through the week starting Jan 12); the
      // phase closes on that week's Friday, Jan 16, not its Sunday.
      { title: "Phase X", startISO: "2026-01-05", endISO: "2026-01-16" },
      // Single-week phase in the week starting Jan 19; ends Friday Jan 23.
      { title: "Phase Y", startISO: "2026-01-19", endISO: "2026-01-23" },
    ]);
  });

  it("extends a phase past its own merge through filled-but-untitled cells, stopping the instant another phase's name appears", () => {
    const ws = buildSheet();
    ws.getCell("A5").value = "Team B";
    ws.mergeCells("B5:C5");
    ws.getCell("B5").value = "Phase A";
    ws.getCell("B5").fill = SOLID_FILL;
    ws.getCell("C5").fill = SOLID_FILL;
    // D5 is not merged into Phase A's bar and carries no title, but the
    // sheet still colors it — the bar visually continues past the merge.
    ws.getCell("D5").fill = SOLID_FILL;
    // Phase B's name starts immediately in the very next column, with no
    // blank gap — it must end Phase A right there, regardless of D5's fill.
    ws.getCell("E5").value = "Phase B";
    ws.getCell("E5").fill = SOLID_FILL;

    const result = parseSheet(ws);
    const teamB = result.lanes.find((l) => l.name === "Team B")!;
    expect(teamB.phases).toEqual([
      // Color visually reaches through D (week of Jan 19), so Phase A
      // closes on that week's Friday, Jan 23 — even though its own merge
      // only covered through C.
      { title: "Phase A", startISO: "2026-01-05", endISO: "2026-01-23" },
      { title: "Phase B", startISO: "2026-01-26", endISO: "2026-01-30" },
    ]);
  });

  it("without a following phase, extends through every filled cell and ends on the Friday the color runs out", () => {
    const ws = buildSheet();
    ws.getCell("A6").value = "Team C";
    ws.mergeCells("B6:C6");
    ws.getCell("B6").value = "Phase Z";
    ws.getCell("B6").fill = SOLID_FILL;
    ws.getCell("C6").fill = SOLID_FILL;
    ws.getCell("D6").fill = SOLID_FILL; // colored continuation, no title
    // E6 is left uncolored — the bar's color genuinely ends there.

    const result = parseSheet(ws);
    const teamC = result.lanes.find((l) => l.name === "Team C")!;
    expect(teamC.phases).toEqual([
      { title: "Phase Z", startISO: "2026-01-05", endISO: "2026-01-23" },
    ]);
  });
});

describe("parseSheet — month-name row fallback", () => {
  it("interpolates column dates across a merged month span when no date row exists", () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Plan");
    ws.getCell("B1").value = 2026;
    ws.mergeCells("B2:E2"); // JANUARY across 4 columns = ~4 "weeks"
    ws.getCell("B2").value = "JANUARY";
    ws.getCell("A4").value = "Datos";
    ws.mergeCells("B4:C4");
    ws.getCell("B4").value = "Habilitación";

    const result = parseSheet(ws);
    expect(result.warnings).toEqual([]);
    const phase = result.lanes[0]!.phases[0]!;
    expect(phase.title).toBe("Habilitación");
    // January has 31 days split across 4 columns (~7-8 days each); the
    // 2-column span (B:C) should land within the first half of the month.
    expect(phase.startISO).toBe("2026-01-01");
    expect(new Date(phase.endISO).getUTCMonth()).toBe(0);
  });
});

describe("parseSheet — no recognizable header", () => {
  it("warns instead of guessing when there's no date or month row", () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Plan");
    ws.getCell("A1").value = "Not a plan";
    ws.getCell("B1").value = "just text";
    const result = parseSheet(ws);
    expect(result.lanes).toEqual([]);
    expect(result.warnings.some((w) => w.includes("fila de fechas"))).toBe(true);
  });
});

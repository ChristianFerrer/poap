import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { listSheetNames, parseSheet } from "./importExcel";

function setFill(cell: ExcelJS.Cell, argb: string) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
}

describe("listSheetNames", () => {
  it("returns every worksheet name in order", () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Uno");
    wb.addWorksheet("Dos");
    expect(listSheetNames(wb)).toEqual(["Uno", "Dos"]);
  });
});

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
    setFill(ws.getCell("B3"), "FF00B050");
    // Row 4: blank lane cell (forward-fills to "Team A") + a single-week phase
    ws.getCell("D4").value = "Phase Y";
    setFill(ws.getCell("D4"), "FF4472C4");
    return ws;
  }

  it("locates phases using the date row and forward-fills the lane name", () => {
    const result = parseSheet(buildSheet());
    expect(result.warnings).toEqual([]);
    expect(result.lanes).toHaveLength(1);
    expect(result.lanes[0]!.name).toBe("Team A");
    expect(result.lanes[0]!.phases).toEqual([
      { title: "Phase X", startISO: "2026-01-05", endISO: "2026-01-18", colorKey: "rgb:FF00B050" },
      { title: "Phase Y", startISO: "2026-01-19", endISO: "2026-01-25", colorKey: "rgb:FF4472C4" },
    ]);
  });

  it("collects one color entry per distinct fill, counted", () => {
    const result = parseSheet(buildSheet());
    expect(result.colors).toEqual(
      expect.arrayContaining([
        { key: "rgb:FF00B050", hex: "#00B050", count: 1 },
        { key: "rgb:FF4472C4", hex: "#4472C4", count: 1 },
      ]),
    );
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
    setFill(ws.getCell("B4"), "FF00B050");

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

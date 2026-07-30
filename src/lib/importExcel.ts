import type ExcelJS from "exceljs";

export interface ImportedPhase {
  title: string;
  /** ISO yyyy-mm-dd */
  startISO: string;
  /** ISO yyyy-mm-dd — the last day the phase covers, always a Friday (see
   * parseSheet's boundary-scan for how it's derived from the sheet). */
  endISO: string;
}

export interface ImportedLane {
  name: string;
  phases: ImportedPhase[];
}

export interface ParseResult {
  lanes: ImportedLane[];
  warnings: string[];
}

const MONTH_NAMES_EN = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
const MONTH_NAMES_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function monthIndexFromName(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  let i = MONTH_NAMES_EN.indexOf(s);
  if (i === -1) i = MONTH_NAMES_ES.indexOf(s);
  return i === -1 ? null : i;
}

interface MergeInfo {
  minRow: number;
  maxRow: number;
  minCol: number;
  maxCol: number;
}

function colLettersToIndex(letters: string): number {
  let col = 0;
  for (const ch of letters) col = col * 26 + (ch.charCodeAt(0) - 64);
  return col;
}

function parseCellRef(ref: string): { col: number; row: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) throw new Error(`Bad cell ref ${ref}`);
  return { col: colLettersToIndex(m[1]!), row: parseInt(m[2]!, 10) };
}

function parseMergeRange(range: string): MergeInfo {
  const [a, b] = range.split(":") as [string, string];
  const pa = parseCellRef(a);
  const pb = parseCellRef(b);
  return {
    minRow: Math.min(pa.row, pb.row),
    maxRow: Math.max(pa.row, pb.row),
    minCol: Math.min(pa.col, pb.col),
    maxCol: Math.max(pa.col, pb.col),
  };
}

/** Keyed "row:col" -> the merge range that cell belongs to, for every cell in every merge. */
function buildMergeIndex(ws: ExcelJS.Worksheet): Map<string, MergeInfo> {
  const merges = (ws.model.merges as string[] | undefined) ?? [];
  const index = new Map<string, MergeInfo>();
  for (const range of merges) {
    let info: MergeInfo;
    try {
      info = parseMergeRange(range);
    } catch {
      continue;
    }
    for (let r = info.minRow; r <= info.maxRow; r++) {
      for (let c = info.minCol; c <= info.maxCol; c++) {
        index.set(`${r}:${c}`, info);
      }
    }
  }
  return index;
}

function cellDateValue(cell: ExcelJS.Cell): Date | null {
  const v: unknown = cell.value;
  if (v instanceof Date) return v;
  if (v && typeof v === "object" && "result" in v) {
    const r = (v as { result: unknown }).result;
    if (r instanceof Date) return r;
  }
  return null;
}

function cellTextValue(cell: ExcelJS.Cell): string | null {
  const v: unknown = cell.value;
  if (typeof v === "string") {
    const t = v.trim();
    return t.length > 0 ? t : null;
  }
  if (typeof v === "number") return null;
  if (v && typeof v === "object" && "richText" in v) {
    const t = (v as { richText: { text: string }[] }).richText.map((part) => part.text).join("").trim();
    return t.length > 0 ? t : null;
  }
  return null;
}

function cellNumberValue(cell: ExcelJS.Cell): number | null {
  const v: unknown = cell.value;
  return typeof v === "number" ? v : null;
}

/** True when the cell carries an actual solid background fill — i.e. it's
 * part of a colored phase bar, as opposed to a blank grid cell. */
function cellHasFill(cell: ExcelJS.Cell): boolean {
  const fill = cell.fill as { type?: string; pattern?: string } | undefined;
  return !!fill && fill.type === "pattern" && fill.pattern === "solid";
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, days: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days));
}
function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

/** The Friday that falls in the same Monday–Sunday week as `d`. Phases are
 * meant to always close out on a Friday, matching how the source sheets lay
 * out work-weeks, regardless of which day the underlying column data lands
 * on. */
function fridayOfWeek(d: Date): Date {
  const dayOfWeek = d.getUTCDay(); // 0=Sun..6=Sat
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  return addDays(d, 4 - daysSinceMonday);
}

const HEADER_SCAN_ROWS = 8;

export function listSheetNames(workbook: ExcelJS.Workbook): string[] {
  return workbook.worksheets.map((ws) => ws.name);
}

/**
 * Reads a "plan on a page" style calendar-grid sheet: a header made of a
 * year row and either an explicit per-column date row or a month-name row
 * (both handled; the date row wins when present, since it's exact), a
 * label column (usually A) whose swimlane name carries down through blank
 * rows below it Excel-style, and phase bars as merged (or single) cells
 * with a fill color. packLane() already re-lays out overlapping phases
 * within a lane, so the source sheet's own row position doesn't need to be
 * preserved — only which lane a phase belongs to and its date span.
 */
export function parseSheet(ws: ExcelJS.Worksheet): ParseResult {
  const warnings: string[] = [];
  const maxCol = ws.columnCount || 200;
  const maxRow = ws.rowCount || 300;
  const mergeIndex = buildMergeIndex(ws);
  const scanRows = Math.min(HEADER_SCAN_ROWS, maxRow);

  let yearRow = -1;
  for (let r = 1; r <= scanRows; r++) {
    let count = 0;
    for (let c = 1; c <= maxCol; c++) {
      const n = cellNumberValue(ws.getCell(r, c));
      if (n !== null && Number.isInteger(n) && n >= 2000 && n <= 2100) count++;
    }
    if (count > 0) {
      yearRow = r;
      break;
    }
  }

  const yearByCol = new Map<number, number>();
  if (yearRow !== -1) {
    let current: number | null = null;
    for (let c = 1; c <= maxCol; c++) {
      const n = cellNumberValue(ws.getCell(yearRow, c));
      if (n !== null && Number.isInteger(n) && n >= 2000 && n <= 2100) current = n;
      if (current !== null) yearByCol.set(c, current);
    }
  }

  let dateRow = -1;
  let bestDateCount = 0;
  for (let r = 1; r <= scanRows; r++) {
    let count = 0;
    for (let c = 1; c <= maxCol; c++) {
      if (cellDateValue(ws.getCell(r, c))) count++;
    }
    if (count > bestDateCount) {
      bestDateCount = count;
      dateRow = r;
    }
  }
  const hasDateRow = dateRow !== -1 && bestDateCount >= 3;

  let monthRow = -1;
  let bestMonthCount = 0;
  for (let r = 1; r <= scanRows; r++) {
    let count = 0;
    for (let c = 1; c <= maxCol; c++) {
      const t = cellTextValue(ws.getCell(r, c));
      if (t && monthIndexFromName(t) !== null) count++;
    }
    if (count > bestMonthCount) {
      bestMonthCount = count;
      monthRow = r;
    }
  }
  const hasMonthRow = monthRow !== -1 && bestMonthCount >= 2;

  const colStartDate = new Map<number, Date>();
  const colPeriodDays = new Map<number, number>();

  if (hasDateRow) {
    const known: { col: number; date: Date }[] = [];
    for (let c = 1; c <= maxCol; c++) {
      const d = cellDateValue(ws.getCell(dateRow, c));
      if (d) known.push({ col: c, date: d });
    }
    for (let i = 0; i < known.length; i++) {
      const { col, date } = known[i]!;
      colStartDate.set(col, date);
      const next = known[i + 1];
      const days = next ? Math.round((next.date.getTime() - date.getTime()) / 86_400_000) : 7;
      colPeriodDays.set(col, days > 0 ? days : 7);
    }
  } else if (hasMonthRow) {
    let c = 1;
    while (c <= maxCol) {
      const t = cellTextValue(ws.getCell(monthRow, c));
      const mi = t ? monthIndexFromName(t) : null;
      if (mi === null) {
        c++;
        continue;
      }
      const merge = mergeIndex.get(`${monthRow}:${c}`);
      let runStart = merge ? merge.minCol : c;
      let runEnd = merge ? merge.maxCol : c;
      if (!merge) {
        while (runEnd + 1 <= maxCol && cellTextValue(ws.getCell(monthRow, runEnd + 1)) === t) runEnd++;
      }
      const year = yearByCol.get(runStart) ?? yearByCol.get(runEnd) ?? new Date().getUTCFullYear();
      const totalDays = daysInMonth(year, mi);
      const span = runEnd - runStart + 1;
      for (let cc = runStart; cc <= runEnd; cc++) {
        const offset = cc - runStart;
        const startDay = Math.floor((offset / span) * totalDays);
        const endDay = Math.floor(((offset + 1) / span) * totalDays);
        colStartDate.set(cc, new Date(Date.UTC(year, mi, 1 + startDay)));
        colPeriodDays.set(cc, Math.max(1, endDay - startDay));
      }
      c = runEnd + 1;
    }
  } else {
    warnings.push("No se encontró una fila de fechas ni de meses reconocible en esta hoja; no se pudo ubicar ninguna fase en el tiempo.");
  }

  function columnRange(col: number): { start: Date; end: Date } | null {
    const start = colStartDate.get(col);
    const days = colPeriodDays.get(col);
    if (!start || !days) return null;
    return { start, end: addDays(start, days) };
  }

  const headerEnd = Math.max(yearRow, dateRow, monthRow, 1);

  const laneOrder: string[] = [];
  const laneMap = new Map<string, ImportedPhase[]>();
  let currentLane: string | null = null;
  const unresolvedTitles = new Set<string>();

  for (let r = headerEnd + 1; r <= maxRow; r++) {
    const laneText = cellTextValue(ws.getCell(r, 1));
    if (laneText) {
      currentLane = laneText;
      if (!laneMap.has(currentLane)) {
        laneMap.set(currentLane, []);
        laneOrder.push(currentLane);
      }
    }
    if (!currentLane) continue;

    for (let c = 2; c <= maxCol; c++) {
      const cell = ws.getCell(r, c);
      const merge = mergeIndex.get(`${r}:${c}`);
      if (merge && (r !== merge.minRow || c !== merge.minCol)) continue;

      const title = cellTextValue(cell);
      if (!title) continue;

      const startCol = merge ? merge.minCol : c;
      const endCol = merge ? merge.maxCol : c;
      const startRange = columnRange(startCol);
      if (!startRange || !columnRange(endCol)) {
        unresolvedTitles.add(title);
        continue;
      }

      // The phase's own title cell (or merge) only marks where its bar
      // *starts* being unambiguous — the bar's actual end is wherever its
      // fill color stops, which can run past the merge when the sheet
      // colors extra cells without merging them in. Walk forward from
      // there: another phase's name ends the current one immediately
      // (two adjacent bars in the same swimlane, whether or not their fill
      // color happens to match); otherwise the current phase keeps going
      // until the fill runs out.
      let boundaryCol = endCol;
      for (let cc = endCol + 1; cc <= maxCol; cc++) {
        const cellMerge = mergeIndex.get(`${r}:${cc}`);
        if (cellMerge && cc !== cellMerge.minCol) continue;

        const nextCell = ws.getCell(r, cc);
        if (cellTextValue(nextCell)) break; // another phase's name starts here
        if (!cellHasFill(nextCell)) break; // the color ends here

        const candidateEndCol = cellMerge ? cellMerge.maxCol : cc;
        if (!columnRange(candidateEndCol)) break; // past known dates
        boundaryCol = candidateEndCol;
        if (cellMerge) cc = cellMerge.maxCol;
      }

      const endRange = columnRange(boundaryCol)!;
      // Phases always close out on the Friday of the week in which their
      // color ends, not mid-week or on the week's last calendar day.
      laneMap.get(currentLane)!.push({
        title,
        startISO: toISO(startRange.start),
        endISO: toISO(fridayOfWeek(endRange.start)),
      });
    }
  }

  if (unresolvedTitles.size > 0) {
    const sample = Array.from(unresolvedTitles).slice(0, 5).join(", ");
    warnings.push(
      `${unresolvedTitles.size} ${unresolvedTitles.size === 1 ? "fase" : "fases"} no se pudieron ubicar en el tiempo y se omitieron (ej.: ${sample}).`,
    );
  }

  const lanes: ImportedLane[] = laneOrder
    .map((name) => ({ name, phases: laneMap.get(name)! }))
    .filter((l) => l.phases.length > 0);

  if (lanes.length === 0) {
    warnings.push("No se encontraron fases en esta hoja.");
  }

  return { lanes, warnings };
}

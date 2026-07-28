import crypto from "node:crypto";
import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";
import { listSheetNames, parseSheet } from "@/lib/importExcel";

export const runtime = "nodejs";

/**
 * Excel parsing (merges, fills, shared-formula date cells) needs a real
 * Node XLSX reader — exceljs — which is too heavy/Node-specific to ship to
 * the client bundle. The browser just uploads the file and a sheet name;
 * this route does the actual reading and returns plain JSON.
 *
 * Real workbooks like the ones this feature targets can have 50+ sheets
 * and take several seconds to parse. Re-parsing on every request (once to
 * list sheets, again per "analyze this sheet" click) would double that
 * wait for no reason, so the loaded workbook is cached in memory for a few
 * minutes, keyed by a token the client carries between requests instead of
 * re-uploading the file.
 */
const WORKBOOK_TTL_MS = 10 * 60 * 1000;
const workbookCache = new Map<string, { workbook: ExcelJS.Workbook; expires: number }>();

function pruneExpired() {
  const now = Date.now();
  for (const [token, entry] of workbookCache) {
    if (entry.expires < now) workbookCache.delete(token);
  }
}

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  pruneExpired();

  const sheet = form.get("sheet");
  const existingToken = form.get("token");

  let workbook: ExcelJS.Workbook;
  let token: string;

  if (typeof existingToken === "string" && workbookCache.has(existingToken)) {
    token = existingToken;
    workbook = workbookCache.get(token)!.workbook;
    workbookCache.set(token, { workbook, expires: Date.now() + WORKBOOK_TTL_MS });
  } else {
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: typeof existingToken === "string" ? "El archivo expiró, volvé a seleccionarlo." : "Falta el archivo." },
        { status: 400 },
      );
    }
    workbook = new ExcelJS.Workbook();
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      await workbook.xlsx.load(buffer);
    } catch {
      return NextResponse.json({ error: "No se pudo leer el archivo. ¿Es un .xlsx válido?" }, { status: 400 });
    }
    token = crypto.randomUUID();
    workbookCache.set(token, { workbook, expires: Date.now() + WORKBOOK_TTL_MS });
  }

  if (typeof sheet !== "string" || !sheet) {
    return NextResponse.json({ token, sheetNames: listSheetNames(workbook) });
  }

  const ws = workbook.getWorksheet(sheet);
  if (!ws) {
    return NextResponse.json({ error: `No existe la hoja "${sheet}".` }, { status: 400 });
  }

  return NextResponse.json({ token, ...parseSheet(ws) });
}

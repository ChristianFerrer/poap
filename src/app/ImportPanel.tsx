"use client";

import { forwardRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import type { ParseResult } from "@/lib/importExcel";
import type { Lane, Phase, PhaseStatus } from "@/components/poap-renderer/types";
import { toAxis } from "@/components/poap-renderer/toAxis";
import { IconClose, IconUpload } from "./icons";
import styles from "./ImportPanel.module.css";

// Vercel serverless functions cap request bodies at 4.5 MB no matter what
// this app configures. Stay comfortably under that for a direct POST, and
// route anything bigger through a direct browser -> Vercel Blob upload
// instead (see /api/import-excel/upload) — the reference workbook this
// feature was built against is already ~5.5 MB, so this isn't an edge case.
const DIRECT_UPLOAD_LIMIT_BYTES = 4 * 1024 * 1024;

// Source sheets use color for team/category, not lifecycle state (checked
// against the actual reference workbook this feature was built against) —
// asking the user to map every color to a status was solving a problem
// the color coding doesn't actually represent. Every imported phase just
// starts here, same as a manually-added one.
const DEFAULT_IMPORT_STATUS: PhaseStatus = "not_started";

const MONTH_ABBR = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}
function formatISODate(iso: string): string {
  const d = isoToDate(iso);
  return `${d.getUTCDate()} ${MONTH_ABBR[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`;
}

/** Converts a parsed sheet into real Lane objects on the app's axis. */
export function importedLanesToLanes(result: ParseResult, startMonth: string): Lane[] {
  return result.lanes.map((lane) => ({
    id: crypto.randomUUID(),
    name: lane.name,
    sortOrder: 0, // caller renumbers against the existing plan
    phases: lane.phases.map((p): Phase => ({
      id: crypto.randomUUID(),
      title: p.title,
      start: toAxis(isoToDate(p.startISO), startMonth),
      end: toAxis(isoToDate(p.endISO), startMonth),
      status: DEFAULT_IMPORT_STATUS,
    })),
  }));
}

async function postForm<T>(body: FormData): Promise<T> {
  const res = await fetch("/api/import-excel", { method: "POST", body });
  // A body too large for the hosting platform's own request-size limit
  // (Vercel serverless functions cap payloads at 4.5 MB, independent of
  // anything this app configures) never reaches our route handler at all —
  // the platform returns a plain-text/HTML error, not JSON, so res.json()
  // itself throws. Surface that as a real message instead of a parse error.
  if (!res.ok && !res.headers.get("content-type")?.includes("application/json")) {
    if (res.status === 413) throw new Error("El archivo es demasiado grande para subir (máximo ~4.5 MB).");
    throw new Error(`El servidor respondió con un error (${res.status}).`);
  }
  const json = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Error al procesar el archivo.");
  return json;
}

/**
 * Import flow: pick a .xlsx -> pick a sheet -> the server parses it
 * (exceljs needs Node, so parsing happens in /api/import-excel, not in the
 * browser) -> review each lane's phases with their actual dates -> confirm
 * adds the result as new swimlanes, every phase starting as "not_started".
 */
export const ImportPanel = forwardRef<
  HTMLDivElement,
  {
    startMonth: string;
    months: number;
    onClose: () => void;
    onImport: (lanes: Lane[]) => void;
  }
>(function ImportPanel({ startMonth, months, onClose, onImport }, ref) {
  const [file, setFile] = useState<File | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [sheetNames, setSheetNames] = useState<string[] | null>(null);
  const [sheet, setSheet] = useState("");
  const [result, setResult] = useState<ParseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState(false);

  async function handleFileChange(f: File) {
    setFile(f);
    setToken(null);
    setSheetNames(null);
    setResult(null);
    setError(null);
    setLoading(true);
    try {
      const form = new FormData();
      if (f.size > DIRECT_UPLOAD_LIMIT_BYTES) {
        const blob = await upload(f.name, f, { access: "public", handleUploadUrl: "/api/import-excel/upload" });
        form.append("blobUrl", blob.url);
      } else {
        form.append("file", f);
      }
      // Real workbooks can take several seconds to parse — the server
      // caches it by token so the next step (analyzing a sheet) doesn't
      // pay that cost again by re-uploading and re-parsing the whole file.
      const data = await postForm<{ token: string; sheetNames: string[] }>(form);
      setToken(data.token);
      setSheetNames(data.sheetNames);
      setSheet(data.sheetNames[0] ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al leer el archivo.");
    } finally {
      setLoading(false);
    }
  }

  async function analyzeSheet() {
    if (!sheet || (!token && !file)) return;
    setError(null);
    setLoading(true);
    try {
      const form = new FormData();
      if (token) form.append("token", token);
      else if (file) form.append("file", file);
      form.append("sheet", sheet);
      const data = await postForm<ParseResult & { token: string }>(form);
      setToken(data.token);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al analizar la hoja.");
    } finally {
      setLoading(false);
    }
  }

  const totalPhases = result ? result.lanes.reduce((n, l) => n + l.phases.length, 0) : 0;
  const outOfRange = result
    ? result.lanes
        .flatMap((l) => l.phases)
        .filter((p) => {
          const start = toAxis(isoToDate(p.startISO), startMonth);
          const end = toAxis(isoToDate(p.endISO), startMonth);
          return end < 0 || start > months;
        }).length
    : 0;

  function confirmImport() {
    if (!result) return;
    onImport(importedLanesToLanes(result, startMonth));
    setImported(true);
  }

  return (
    <section ref={ref} className={styles.panel}>
      <button className={styles.close} onClick={onClose} aria-label="Cerrar">
        <IconClose />
      </button>
      <p className={styles.eyebrow}>Importar plan</p>
      <h2 className={styles.title}>Desde un archivo Excel</h2>

      {imported ? (
        <p className={styles.success}>
          Se importaron {result?.lanes.length ?? 0} swimlines con {totalPhases} fases (todas como "No iniciado"). Ya
          podés revisarlas y ajustarlas como cualquier otro swimline.
        </p>
      ) : (
        <>
          <div className={styles.step}>
            <label className={styles.fileLabel}>
              <input
                type="file"
                accept=".xlsx"
                className={styles.fileInput}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileChange(f);
                }}
              />
              <IconUpload />
              {file ? file.name : "Elegir archivo .xlsx…"}
            </label>
          </div>

          {loading && <p className={styles.status}>Procesando… los archivos grandes pueden tardar varios segundos.</p>}
          {error && <p className={styles.error}>{error}</p>}

          {sheetNames && !result && (
            <div className={styles.step}>
              <label className={styles.sheetLabel}>
                Hoja
                <select className={styles.sheetSelect} value={sheet} onChange={(e) => setSheet(e.target.value)}>
                  {sheetNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className={styles.primaryButton} onClick={analyzeSheet} disabled={loading}>
                Analizar hoja
              </button>
            </div>
          )}

          {result && (
            <div className={styles.review}>
              {result.warnings.length > 0 && (
                <ul className={styles.warnings}>
                  {result.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}

              {result.lanes.length > 0 && (
                <>
                  <p className={styles.summary}>
                    {result.lanes.length} {result.lanes.length === 1 ? "swimline" : "swimlines"} · {totalPhases}{" "}
                    {totalPhases === 1 ? "fase" : "fases"} · todas como "No iniciado"
                    {outOfRange > 0 && (
                      <span className={styles.rangeWarning}>
                        {" "}
                        · {outOfRange} {outOfRange === 1 ? "fase cae" : "fases caen"} fuera del rango de{" "}
                        {months} meses visible actualmente (igual se importan)
                      </span>
                    )}
                  </p>

                  <p className={styles.sectionTitle}>Vista previa</p>
                  <div className={styles.preview}>
                    {result.lanes.map((l) => (
                      <div key={l.name} className={styles.previewLaneGroup}>
                        <p className={styles.previewLaneName}>
                          {l.name} <span className={styles.rowMeta}>({l.phases.length})</span>
                        </p>
                        {l.phases.map((p, i) => (
                          <div key={i} className={styles.previewPhaseRow}>
                            <span className={styles.previewPhaseTitle}>{p.title}</span>
                            <span className={styles.previewPhaseDates}>
                              {formatISODate(p.startISO)} → {formatISODate(p.endISO)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>

                  <div className={styles.actions}>
                    <button type="button" className={styles.secondaryButton} onClick={() => setResult(null)}>
                      Elegir otra hoja
                    </button>
                    <button type="button" className={styles.primaryButton} onClick={confirmImport}>
                      Importar {result.lanes.length} {result.lanes.length === 1 ? "swimline" : "swimlines"}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
});

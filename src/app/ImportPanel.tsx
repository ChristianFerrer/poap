"use client";

import { forwardRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import type { ImportedColor, ParseResult } from "@/lib/importExcel";
import type { Lane, Phase, PhaseStatus } from "@/components/poap-renderer/types";
import { toAxis } from "@/components/poap-renderer/toAxis";
import styles from "./ImportPanel.module.css";

// Vercel serverless functions cap request bodies at 4.5 MB no matter what
// this app configures. Stay comfortably under that for a direct POST, and
// route anything bigger through a direct browser -> Vercel Blob upload
// instead (see /api/import-excel/upload) — the reference workbook this
// feature was built against is already ~5.5 MB, so this isn't an edge case.
const DIRECT_UPLOAD_LIMIT_BYTES = 4 * 1024 * 1024;

const STATUS_LABEL: Record<PhaseStatus, string> = {
  done: "Completado",
  in_progress: "En curso",
  at_risk: "En riesgo",
  not_started: "No iniciado",
};
const STATUS_OPTIONS: PhaseStatus[] = ["not_started", "in_progress", "at_risk", "done"];

function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

/** Converts a parsed sheet into real Lane objects on the app's axis, using
 * the color -> status choices the user made in the review step. */
export function importedLanesToLanes(result: ParseResult, colorStatus: Record<string, PhaseStatus>, startMonth: string): Lane[] {
  return result.lanes.map((lane) => ({
    id: crypto.randomUUID(),
    name: lane.name,
    sortOrder: 0, // caller renumbers against the existing plan
    phases: lane.phases.map((p): Phase => ({
      id: crypto.randomUUID(),
      title: p.title,
      start: toAxis(isoToDate(p.startISO), startMonth),
      end: toAxis(isoToDate(p.endISO), startMonth),
      status: colorStatus[p.colorKey] ?? "not_started",
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
 * browser) -> review swimlanes/phases and assign a status to each distinct
 * cell color found (color coding in these sheets is workstream/category,
 * not done/in_progress/at_risk/not_started, so there's no reliable way to
 * guess it automatically) -> confirm adds the result as new swimlanes.
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
  const [colorStatus, setColorStatus] = useState<Record<string, PhaseStatus>>({});
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
      const defaults: Record<string, PhaseStatus> = {};
      for (const c of data.colors) defaults[c.key] = "not_started";
      setColorStatus(defaults);
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
    onImport(importedLanesToLanes(result, colorStatus, startMonth));
    setImported(true);
  }

  return (
    <section ref={ref} className={styles.panel}>
      <button className={styles.close} onClick={onClose} aria-label="Cerrar">
        ✕
      </button>
      <p className={styles.eyebrow}>Importar plan</p>
      <h2 className={styles.title}>Desde un archivo Excel</h2>

      {imported ? (
        <p className={styles.success}>
          Se importaron {result?.lanes.length ?? 0} swimlines con {totalPhases} fases. Ya podés revisarlas y ajustarlas
          como cualquier otro swimline.
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
                    {totalPhases === 1 ? "fase" : "fases"}
                    {outOfRange > 0 && (
                      <span className={styles.rangeWarning}>
                        {" "}
                        · {outOfRange} {outOfRange === 1 ? "fase cae" : "fases caen"} fuera del rango de{" "}
                        {months} meses visible actualmente (igual se importan)
                      </span>
                    )}
                  </p>

                  <p className={styles.sectionTitle}>Colores encontrados — asigná un estado a cada uno</p>
                  <p className={styles.hint}>
                    El color en estos archivos suele indicar equipo o categoría, no estado — por eso no se adivina
                    automáticamente.
                  </p>
                  <div className={styles.colorList}>
                    {result.colors.map((c) => (
                      <div key={c.key} className={styles.colorRow}>
                        <span
                          className={styles.swatch}
                          style={{ background: c.hex ?? "transparent" }}
                          aria-hidden="true"
                        />
                        <span className={styles.colorCount}>{c.count}×</span>
                        <select
                          className={styles.statusSelect}
                          value={colorStatus[c.key] ?? "not_started"}
                          onChange={(e) => setColorStatus((prev) => ({ ...prev, [c.key]: e.target.value as PhaseStatus }))}
                          aria-label={`Estado para el color con ${c.count} fases`}
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                              {STATUS_LABEL[s]}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>

                  <p className={styles.sectionTitle}>Vista previa</p>
                  <div className={styles.preview}>
                    {result.lanes.map((l) => (
                      <div key={l.name} className={styles.previewLane}>
                        <span className={styles.previewLaneName}>{l.name}</span>
                        <span className={styles.rowMeta}>
                          {l.phases.length} {l.phases.length === 1 ? "fase" : "fases"}
                        </span>
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

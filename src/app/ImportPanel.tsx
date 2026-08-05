"use client";

import { forwardRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import type { ParseResult } from "@/lib/importExcel";
import type { Lane, Phase, PhaseStatus } from "@/components/poap-renderer/types";
import { toAxis } from "@/components/poap-renderer/toAxis";
import { MONTH_ABBR, STATUS_LABELS, type Locale } from "@/lib/i18n";
import { IconClose, IconUpload } from "@/lib/icons";
import { useLanguage } from "./i18n/LanguageProvider";
import { translations } from "./i18n/translations";
import styles from "./ImportPanel.module.css";
import explorerStyles from "./ExplorerPanel.module.css";

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

function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}
function formatISODate(iso: string, monthAbbr: string[]): string {
  const d = isoToDate(iso);
  return `${d.getUTCDate()} ${monthAbbr[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`;
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

async function postForm<T>(body: FormData, locale: Locale): Promise<T> {
  const T_ = translations[locale].import;
  const res = await fetch("/api/import-excel", { method: "POST", body });
  // A body too large for the hosting platform's own request-size limit
  // (Vercel serverless functions cap payloads at 4.5 MB, independent of
  // anything this app configures) never reaches our route handler at all —
  // the platform returns a plain-text/HTML error, not JSON, so res.json()
  // itself throws. Surface that as a real message instead of a parse error.
  if (!res.ok && !res.headers.get("content-type")?.includes("application/json")) {
    if (res.status === 413) throw new Error(T_.errorTooLarge);
    throw new Error(T_.errorServer(res.status));
  }
  const json = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? T_.errorProcess);
  return json;
}

/**
 * Import flow: pick a .xlsx -> pick a sheet -> the server parses it
 * (exceljs needs Node, so parsing happens in /api/import-excel, not in the
 * browser) -> review each lane's phases with their actual dates -> confirm
 * adds the result as new swimlanes, every phase starting as "not_started".
 *
 * `nameField` is optional and changes nothing about that flow — it only
 * adds a name input above the file picker and requires it non-empty
 * before confirming. The Program page uses this to import a workbook as
 * a brand-new project (which needs a name the way "add lanes to the
 * project I'm already on" never did); the project page's own import
 * omits it and behaves exactly as before.
 */
export const ImportPanel = forwardRef<
  HTMLDivElement,
  {
    startMonth: string;
    months: number;
    nameField?: { value: string; onChange: (value: string) => void; placeholder: string };
    onClose: () => void;
    onImport: (lanes: Lane[]) => void;
  }
>(function ImportPanel({ startMonth, months, nameField, onClose, onImport }, ref) {
  const { t, locale } = useLanguage();
  const monthAbbr = MONTH_ABBR[locale];
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
      const data = await postForm<{ token: string; sheetNames: string[] }>(form, locale);
      setToken(data.token);
      setSheetNames(data.sheetNames);
      setSheet(data.sheetNames[0] ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : t.import.errorRead);
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
      const data = await postForm<ParseResult & { token: string }>(form, locale);
      setToken(data.token);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.import.errorAnalyze);
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

  const statusLabel = STATUS_LABELS[locale].not_started;

  return (
    <section ref={ref} className={styles.panel}>
      <button className={styles.close} onClick={onClose} aria-label={t.import.close}>
        <IconClose />
      </button>
      <p className={styles.eyebrow}>{t.import.eyebrow}</p>
      <h2 className={styles.title}>{t.import.title}</h2>

      {imported ? (
        <p className={styles.success}>{t.import.success(result?.lanes.length ?? 0, totalPhases, statusLabel)}</p>
      ) : (
        <>
          {nameField && (
            <div className={styles.step}>
              <input
                className={explorerStyles.textInput}
                placeholder={nameField.placeholder}
                value={nameField.value}
                onChange={(e) => nameField.onChange(e.target.value)}
              />
            </div>
          )}

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
              {file ? file.name : t.import.chooseFilePlaceholder}
            </label>
          </div>

          {loading && <p className={styles.status}>{t.import.processing}</p>}
          {error && <p className={styles.error}>{error}</p>}

          {sheetNames && !result && (
            <div className={styles.step}>
              <label className={styles.sheetLabel}>
                {t.import.sheetLabel}
                <select className={styles.sheetSelect} value={sheet} onChange={(e) => setSheet(e.target.value)}>
                  {sheetNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className={styles.primaryButton} onClick={analyzeSheet} disabled={loading}>
                {t.import.analyzeButton}
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
                    {t.import.summaryPrefix(result.lanes.length, totalPhases, statusLabel)}
                    {outOfRange > 0 && (
                      <span className={styles.rangeWarning}>{t.import.rangeWarning(outOfRange, months)}</span>
                    )}
                  </p>

                  <p className={styles.sectionTitle}>{t.import.previewSection}</p>
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
                              {formatISODate(p.startISO, monthAbbr)} → {formatISODate(p.endISO, monthAbbr)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>

                  <div className={styles.actions}>
                    <button type="button" className={styles.secondaryButton} onClick={() => setResult(null)}>
                      {t.import.chooseAnotherSheet}
                    </button>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      disabled={Boolean(nameField) && !nameField!.value.trim()}
                      onClick={confirmImport}
                    >
                      {t.import.importConfirm(result.lanes.length)}
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

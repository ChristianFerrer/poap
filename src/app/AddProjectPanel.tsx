"use client";

import { forwardRef, useState } from "react";
import type { Lane, Phase, PhaseStatus } from "@/components/poap-renderer/types";
import type { StageCategoryDef } from "@/lib/portfolio";
import { fromISODate } from "./dateAxis";
import { IconClose, IconPlus } from "@/lib/icons";
import { useLanguage } from "./i18n/LanguageProvider";
import { DateRangeField } from "./DateRangeField";
import styles from "./ExplorerPanel.module.css";

interface StageRow {
  categoryId: string;
  label: string;
  checked: boolean;
  start: string;
  end: string;
}

/**
 * Program-level "add project" panel — reuses ExplorerPanel's own styles
 * (same panel chrome, same table look) rather than a new stylesheet, since
 * visually this is just another management panel like Swimlines/Gates.
 *
 * The stage checklist is the live, user-editable project lifecycle
 * (Settings → Fases de proyecto — see stageCategories in ProjectsProvider)
 * rather than a free-form "add phase" loop — checking a stage and giving
 * it dates is enough to seed the new project's one default lane with a
 * correctly-tagged phase, which is what lets the Program portfolio's
 * per-project summary bars (SIT/UAT/Go Live/…) show up immediately
 * instead of waiting for team-level detail. Unchecked stages, or checked
 * ones missing a date, are simply left out — nothing forces you to plan
 * every stage before the project can exist.
 */
export const AddProjectPanel = forwardRef<
  HTMLDivElement,
  {
    startMonth: string;
    stageCategories: StageCategoryDef[];
    onClose: () => void;
    onCreate: (input: { name: string; lanes: Lane[] }) => void;
  }
>(function AddProjectPanel({ startMonth, stageCategories, onClose, onCreate }, ref) {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [rows, setRows] = useState<StageRow[]>(() =>
    stageCategories.map((c) => ({ categoryId: c.id, label: c.label, checked: false, start: "", end: "" })),
  );

  function updateRow(categoryId: string, patch: Partial<StageRow>) {
    setRows((prev) => prev.map((r) => (r.categoryId === categoryId ? { ...r, ...patch } : r)));
  }

  const canSubmit = name.trim().length > 0;

  function submit() {
    if (!canSubmit) return;
    const phases: Phase[] = rows
      .filter((r) => r.checked && r.start && r.end)
      .map((r) => ({
        id: crypto.randomUUID(),
        title: r.label,
        start: fromISODate(r.start, startMonth),
        end: fromISODate(r.end, startMonth),
        status: "not_started" as PhaseStatus,
        category: r.categoryId,
      }));
    const lanes: Lane[] = phases.length
      ? [{ id: crypto.randomUUID(), name: t.addProject.defaultLaneName, sortOrder: 0, phases }]
      : [];
    onCreate({ name: name.trim(), lanes });
  }

  return (
    <section ref={ref} className={styles.panel}>
      <button className={styles.close} onClick={onClose} aria-label={t.explorer.close}>
        <IconClose />
      </button>
      <p className={styles.eyebrow}>{t.addProject.eyebrow}</p>
      <h2 className={styles.title}>{t.addProject.title}</h2>

      <div className={styles.addGroup}>
        <p className={styles.sectionTitle}>{t.addProject.nameSection}</p>
        <input
          className={styles.textInput}
          placeholder={t.addProject.namePlaceholder}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className={styles.addGroup}>
        <p className={styles.sectionTitle}>{t.addProject.stagesSection}</p>
        <p className={styles.subtitle}>{t.addProject.stagesHint}</p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th aria-hidden="true" />
                <th>{t.explorer.tableTitle}</th>
                <th>{t.explorer.tableDateRange}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.categoryId}>
                  <td>
                    <input
                      type="checkbox"
                      checked={row.checked}
                      onChange={(e) => updateRow(row.categoryId, { checked: e.target.checked })}
                      aria-label={row.label}
                    />
                  </td>
                  <td className={styles.tableNameCell}>{row.label}</td>
                  <td>
                    <DateRangeField
                      startValue={row.start}
                      endValue={row.end}
                      disabled={!row.checked}
                      onChange={(start, end) => updateRow(row.categoryId, { start, end })}
                      ariaLabel={t.explorer.dateRangeAria}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <button type="button" className={styles.addButton} disabled={!canSubmit} onClick={submit}>
        <IconPlus /> {t.addProject.createButton}
      </button>
    </section>
  );
});

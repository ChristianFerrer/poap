"use client";

import type { PhaseStatus } from "@/components/poap-renderer/types";
import type { Project } from "@/lib/portfolio";
import { projectOverallStatus } from "@/lib/portfolio";
import { STATUS_LABELS } from "@/lib/i18n";
import { useLanguage } from "./i18n/LanguageProvider";
import styles from "./ExecutiveSummary.module.css";

const STATUS_ORDER: PhaseStatus[] = ["at_risk", "in_progress", "not_started", "done"];
const STATUS_VAR: Record<PhaseStatus, string> = {
  at_risk: "color-amber",
  in_progress: "color-iris",
  not_started: "color-fog",
  done: "color-mint",
};

/**
 * The Program page's "read this in five seconds" strip — one status pill
 * per lifecycle stage across every project (not per-project detail, that's
 * what drilling into a project is for), plus an inline "why" note for
 * every at-risk project so a PMO/sponsor never has to open one just to
 * find out what's wrong. Notes are freeform and optional (see
 * Project.note / setProjectNote) — nothing here is a required field.
 */
export function ExecutiveSummary({
  projects,
  onSetNote,
}: {
  projects: Project[];
  onSetNote: (projectId: string, note: string) => void;
}) {
  const { t, locale } = useLanguage();

  const byStatus = new Map<PhaseStatus, Project[]>();
  for (const project of projects) {
    const status = projectOverallStatus(project);
    const group = byStatus.get(status) ?? [];
    group.push(project);
    byStatus.set(status, group);
  }
  const atRiskProjects = byStatus.get("at_risk") ?? [];

  if (projects.length === 0) return null;

  return (
    <section className={styles.strip} aria-label={t.summary.riskHeading}>
      <div className={styles.counts}>
        <span className={styles.totalCount}>{t.summary.projectsCount(projects.length)}</span>
        {STATUS_ORDER.map((status) => {
          const count = byStatus.get(status)?.length ?? 0;
          if (count === 0) return null;
          return (
            <span
              key={status}
              className={styles.countPill}
              style={{
                background: `color-mix(in srgb, var(--${STATUS_VAR[status]}) 18%, var(--color-surface))`,
                color: `var(--${STATUS_VAR[status]}-ink)`,
              }}
            >
              <span className={styles.countDot} style={{ background: `var(--${STATUS_VAR[status]})` }} />
              {count} {STATUS_LABELS[locale][status].toLowerCase()}
            </span>
          );
        })}
      </div>

      {atRiskProjects.length > 0 && (
        <div className={styles.riskList}>
          <p className={styles.riskHeading}>{t.summary.riskHeading}</p>
          {atRiskProjects.map((project) => (
            <div key={project.id} className={styles.riskRow}>
              <span className={styles.riskName}>{project.name}</span>
              <input
                className={styles.riskNoteInput}
                value={project.note ?? ""}
                onChange={(e) => onSetNote(project.id, e.target.value)}
                placeholder={t.summary.riskNotePlaceholder}
                aria-label={t.summary.riskNoteAria(project.name)}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

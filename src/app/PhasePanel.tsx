"use client";

import { useState } from "react";
import type { Lane, PhaseStatus } from "@/components/poap-renderer/types";
import { activitiesFor } from "./mock-data";
import styles from "./PhasePanel.module.css";

const STATUS_LABEL: Record<PhaseStatus, string> = {
  done: "Completado",
  in_progress: "En curso",
  at_risk: "En riesgo",
  not_started: "No iniciado",
};
const STATUS_VAR: Record<PhaseStatus, string> = {
  done: "text-success",
  in_progress: "text-accent",
  at_risk: "text-warning",
  not_started: "text-secondary",
};

/**
 * Demo-only wiring for the interaction spec: click a phase bar -> panel with
 * its activities; click an activity -> its comment thread expands inline,
 * no navigation. This lives outside poap-renderer on purpose — the renderer
 * only exposes onPhaseClick/selectedPhaseId, it doesn't know activities or
 * comments exist. A real app would swap this for Supabase-backed data.
 */
export function PhasePanel({
  lanes,
  phaseId,
  onClose,
}: {
  lanes: Lane[];
  phaseId: string;
  onClose: () => void;
}) {
  const phase = lanes.flatMap((l) => l.phases).find((p) => p.id === phaseId);
  const lane = lanes.find((l) => l.phases.some((p) => p.id === phaseId));
  const [openActivity, setOpenActivity] = useState<string | null>(null);
  const [commentsByActivity, setCommentsByActivity] = useState<
    Record<string, { author: string; date: string; text: string }[]>
  >({});
  const [draft, setDraft] = useState("");

  if (!phase || !lane) return null;
  const activities = activitiesFor(phase.id);

  function submitComment(activityId: string) {
    const text = draft.trim();
    if (!text) return;
    setCommentsByActivity((prev) => ({
      ...prev,
      [activityId]: [...(prev[activityId] ?? []), { author: "Tú", date: "hoy", text }],
    }));
    setDraft("");
  }

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <aside className={styles.panel}>
        <button className={styles.close} onClick={onClose} aria-label="Cerrar">✕</button>
        <p className={styles.eyebrow}>{lane.name}</p>
        <h2 className={styles.title}>{phase.title}</h2>
        <span className={styles.pill} style={{ background: `color-mix(in srgb, var(--${STATUS_VAR[phase.status]}) 18%, var(--card-bg))`, color: `var(--${STATUS_VAR[phase.status]})` }}>
          <span className={styles.pillDot} style={{ background: `var(--${STATUS_VAR[phase.status]})` }} />
          {STATUS_LABEL[phase.status]}
        </span>

        <p className={styles.sectionTitle}>Actividades ({activities.length})</p>
        {activities.map((a) => {
          const isOpen = openActivity === a.id;
          const seedComments = a.comments ?? [];
          const extraComments = commentsByActivity[a.id] ?? [];
          const allComments = [...seedComments, ...extraComments];
          return (
            <div key={a.id} className={styles.activity}>
              <button
                className={styles.activityHead}
                onClick={() => {
                  setOpenActivity(isOpen ? null : a.id);
                  setDraft("");
                }}
              >
                <span className={styles.activityDot} style={{ background: `var(--${STATUS_VAR[a.status]})` }} />
                <span className={styles.activityName}>{a.title}</span>
                <span>{isOpen ? "−" : "+"}</span>
              </button>
              {isOpen && (
                <div className={styles.activityBody}>
                  {allComments.length === 0 && <p className={styles.noComments}>Aún no hay comentarios.</p>}
                  {allComments.map((c, i) => (
                    <div key={i} className={styles.comment}>
                      <div className={styles.commentHead}>
                        <span className={styles.commentAuthor}>{c.author}</span>
                        <span className={styles.commentDate}>{c.date}</span>
                      </div>
                      <p className={styles.commentText}>{c.text}</p>
                    </div>
                  ))}
                  <div className={styles.commentForm}>
                    <textarea
                      placeholder="Añadir un comentario…"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                    />
                    <button disabled={!draft.trim()} onClick={() => submitComment(a.id)}>
                      Comentar
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </aside>
    </>
  );
}

"use client";

import { forwardRef, useState } from "react";
import type { Lane, Phase, PhaseStatus } from "@/components/poap-renderer/types";
import { fromAxis, toAxis } from "@/components/poap-renderer/toAxis";
import type { ActivityComment, ActivitySeed } from "./mock-data";
import styles from "./ExplorerPanel.module.css";

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
const STATUS_OPTIONS: PhaseStatus[] = ["not_started", "in_progress", "at_risk", "done"];
const MONTH_ABBR = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export type ExplorerView =
  | { level: "lanes" }
  | { level: "phases"; laneId: string }
  | { level: "activities"; phaseId: string }
  | { level: "activity"; phaseId: string; activityId: string };

function toISODate(position: number, startMonth: string): string {
  return fromAxis(position, startMonth).toISOString().slice(0, 10);
}
function fromISODate(iso: string, startMonth: string): number {
  const [y, m, day] = iso.split("-").map(Number) as [number, number, number];
  return toAxis(new Date(Date.UTC(y, m - 1, day)), startMonth);
}
function formatDate(position: number, startMonth: string): string {
  const d = fromAxis(position, startMonth);
  return `${d.getUTCDate()} ${MONTH_ABBR[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`;
}

function StatusPill({ status }: { status: PhaseStatus }) {
  return (
    <span
      className={styles.pill}
      style={{
        background: `color-mix(in srgb, var(--${STATUS_VAR[status]}) 18%, var(--card-bg))`,
        color: `var(--${STATUS_VAR[status]})`,
      }}
    >
      <span className={styles.pillDot} style={{ background: `var(--${STATUS_VAR[status]})` }} />
      {STATUS_LABEL[status]}
    </span>
  );
}

function Breadcrumb({
  items,
  onNavigate,
}: {
  items: { label: string; view?: ExplorerView }[];
  onNavigate: (view: ExplorerView) => void;
}) {
  return (
    <nav className={styles.breadcrumb} aria-label="Ruta de navegación">
      {items.map((item, i) => (
        <span key={i} className={styles.breadcrumbItem}>
          {item.view ? (
            <button type="button" className={styles.breadcrumbLink} onClick={() => onNavigate(item.view!)}>
              {item.label}
            </button>
          ) : (
            <span className={styles.breadcrumbCurrent}>{item.label}</span>
          )}
          {i < items.length - 1 && (
            <span className={styles.breadcrumbSep} aria-hidden="true">
              /
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}

/**
 * Drill-down management panel: Swimlines -> a lane's phases -> a phase's
 * activities -> one activity's full detail + comments. Lives outside
 * poap-renderer on the same principle as GatesPanel — the renderer only
 * exposes onLaneClick/onPhaseClick, it has no idea activities or comments
 * exist. A real app would swap the state this mutates for Supabase tables.
 *
 * Clicking a bar in the chart jumps straight to the "activities" level for
 * that phase (skipping lanes/phases) — the breadcrumb still lets you climb
 * back up into that phase's lane from there.
 */
export const ExplorerPanel = forwardRef<
  HTMLDivElement,
  {
    lanes: Lane[];
    startMonth: string;
    view: ExplorerView;
    getActivities: (phase: Phase) => ActivitySeed[];
    onNavigate: (view: ExplorerView) => void;
    onClose: () => void;
    onAddLane: (name: string) => void;
    onUpdatePhase: (
      laneId: string,
      phaseId: string,
      patch: Partial<Pick<Phase, "title" | "start" | "end" | "status">>,
    ) => void;
    onAddPhase: (laneId: string, phase: Phase) => void;
    onAddActivity: (phase: Phase, activity: ActivitySeed) => void;
    onDeleteLane: (laneId: string) => void;
    onDeletePhase: (laneId: string, phaseId: string) => void;
    onDeleteActivity: (phase: Phase, activityId: string) => void;
  }
>(function ExplorerPanel(
  {
    lanes,
    startMonth,
    view,
    getActivities,
    onNavigate,
    onClose,
    onAddLane,
    onUpdatePhase,
    onAddPhase,
    onAddActivity,
    onDeleteLane,
    onDeletePhase,
    onDeleteActivity,
  },
  ref,
) {
  const [newLaneName, setNewLaneName] = useState("");
  const [newPhase, setNewPhase] = useState({ title: "", start: "", end: "", status: "not_started" as PhaseStatus });
  const [newActivity, setNewActivity] = useState({ title: "", owner: "", start: "", end: "", status: "not_started" as PhaseStatus });
  const [commentsByActivity, setCommentsByActivity] = useState<Record<string, ActivityComment[]>>({});
  const [draft, setDraft] = useState("");

  function findPhase(phaseId: string): { lane: Lane; phase: Phase } | null {
    for (const lane of lanes) {
      const phase = lane.phases.find((p) => p.id === phaseId);
      if (phase) return { lane, phase };
    }
    return null;
  }

  function submitComment(activityId: string) {
    const text = draft.trim();
    if (!text) return;
    setCommentsByActivity((prev) => ({
      ...prev,
      [activityId]: [...(prev[activityId] ?? []), { author: "Tú", date: "hoy", text }],
    }));
    setDraft("");
  }

  function submitNewPhase(laneId: string) {
    if (!newPhase.title.trim() || !newPhase.start || !newPhase.end) return;
    onAddPhase(laneId, {
      id: crypto.randomUUID(),
      title: newPhase.title.trim(),
      start: fromISODate(newPhase.start, startMonth),
      end: fromISODate(newPhase.end, startMonth),
      status: newPhase.status,
    });
    setNewPhase({ title: "", start: "", end: "", status: "not_started" });
  }

  function submitNewActivity(phase: Phase) {
    if (!newActivity.title.trim() || !newActivity.owner.trim() || !newActivity.start || !newActivity.end) return;
    onAddActivity(phase, {
      id: crypto.randomUUID(),
      title: newActivity.title.trim(),
      owner: newActivity.owner.trim(),
      start: fromISODate(newActivity.start, startMonth),
      end: fromISODate(newActivity.end, startMonth),
      status: newActivity.status,
    });
    setNewActivity({ title: "", owner: "", start: "", end: "", status: "not_started" });
  }

  const rootCrumb = { label: "Swimlines", view: { level: "lanes" } as ExplorerView };

  return (
    <section ref={ref} className={styles.panel}>
      <button className={styles.close} onClick={onClose} aria-label="Cerrar">
        ✕
      </button>

      {view.level === "lanes" && (
        <>
          <p className={styles.eyebrow}>Programa</p>
          <h2 className={styles.title}>Swimlines</h2>
          <div className={styles.list}>
            {lanes.map((lane) => (
              <div key={lane.id} className={styles.laneRow}>
                <button
                  type="button"
                  className={styles.laneRowMain}
                  onClick={() => onNavigate({ level: "phases", laneId: lane.id })}
                >
                  <span className={styles.laneRowName}>{lane.name}</span>
                  <span className={styles.rowMeta}>
                    {lane.phases.length} {lane.phases.length === 1 ? "fase" : "fases"}
                  </span>
                  <span className={styles.chevronRight} aria-hidden="true">
                    ›
                  </span>
                </button>
                <button
                  type="button"
                  className={styles.deleteButton}
                  onClick={() => onDeleteLane(lane.id)}
                  aria-label={`Eliminar swimline ${lane.name}`}
                >
                  ✕
                </button>
              </div>
            ))}
            {lanes.length === 0 && <p className={styles.empty}>No hay swimlines todavía.</p>}
          </div>
          <p className={styles.sectionTitle}>Agregar swimline</p>
          <div className={styles.addRow}>
            <input
              className={styles.textInput}
              placeholder="Nombre del swimline"
              value={newLaneName}
              onChange={(e) => setNewLaneName(e.target.value)}
            />
            <button
              type="button"
              className={styles.addButton}
              disabled={!newLaneName.trim()}
              onClick={() => {
                onAddLane(newLaneName.trim());
                setNewLaneName("");
              }}
            >
              Agregar
            </button>
          </div>
        </>
      )}

      {view.level === "phases" &&
        (() => {
          const lane = lanes.find((l) => l.id === view.laneId);
          if (!lane) return null;
          return (
            <>
              <Breadcrumb items={[rootCrumb, { label: lane.name }]} onNavigate={onNavigate} />
              <h2 className={styles.title}>{lane.name}</h2>
              <p className={styles.subtitle}>
                {lane.phases.length} {lane.phases.length === 1 ? "fase" : "fases"}
              </p>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Título</th>
                      <th>Inicio</th>
                      <th>Fin</th>
                      <th>Estado</th>
                      <th aria-hidden="true" />
                      <th aria-hidden="true" />
                    </tr>
                  </thead>
                  <tbody>
                    {lane.phases.map((phase) => (
                      <tr key={phase.id}>
                        <td>
                          <input
                            className={styles.tableTextInput}
                            value={phase.title}
                            onChange={(e) => onUpdatePhase(lane.id, phase.id, { title: e.target.value })}
                            aria-label="Título de la fase"
                          />
                        </td>
                        <td>
                          <input
                            type="date"
                            className={styles.dateInput}
                            value={toISODate(phase.start, startMonth)}
                            onChange={(e) => {
                              if (e.target.value) onUpdatePhase(lane.id, phase.id, { start: fromISODate(e.target.value, startMonth) });
                            }}
                            aria-label="Fecha de inicio"
                          />
                        </td>
                        <td>
                          <input
                            type="date"
                            className={styles.dateInput}
                            value={toISODate(phase.end, startMonth)}
                            onChange={(e) => {
                              if (e.target.value) onUpdatePhase(lane.id, phase.id, { end: fromISODate(e.target.value, startMonth) });
                            }}
                            aria-label="Fecha de fin"
                          />
                        </td>
                        <td>
                          <select
                            className={styles.statusSelect}
                            value={phase.status}
                            onChange={(e) => onUpdatePhase(lane.id, phase.id, { status: e.target.value as PhaseStatus })}
                            aria-label="Estado de la fase"
                          >
                            {STATUS_OPTIONS.map((s) => (
                              <option key={s} value={s}>
                                {STATUS_LABEL[s]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <button
                            type="button"
                            className={styles.viewButton}
                            onClick={() => onNavigate({ level: "activities", phaseId: phase.id })}
                            aria-label={`Ver actividades de ${phase.title}`}
                          >
                            ›
                          </button>
                        </td>
                        <td>
                          <button
                            type="button"
                            className={styles.deleteButton}
                            onClick={() => onDeletePhase(lane.id, phase.id)}
                            aria-label={`Eliminar fase ${phase.title}`}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                    {lane.phases.length === 0 && (
                      <tr>
                        <td colSpan={6} className={styles.emptyCell}>
                          Este swimline no tiene fases todavía.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <p className={styles.sectionTitle}>Agregar fase</p>
              <div className={styles.addRow}>
                <input
                  className={styles.textInput}
                  placeholder="Título de la fase"
                  value={newPhase.title}
                  onChange={(e) => setNewPhase((p) => ({ ...p, title: e.target.value }))}
                />
                <input
                  type="date"
                  className={styles.dateInput}
                  value={newPhase.start}
                  onChange={(e) => setNewPhase((p) => ({ ...p, start: e.target.value }))}
                  aria-label="Fecha de inicio"
                />
                <input
                  type="date"
                  className={styles.dateInput}
                  value={newPhase.end}
                  onChange={(e) => setNewPhase((p) => ({ ...p, end: e.target.value }))}
                  aria-label="Fecha de fin"
                />
                <select
                  className={styles.statusSelect}
                  value={newPhase.status}
                  onChange={(e) => setNewPhase((p) => ({ ...p, status: e.target.value as PhaseStatus }))}
                  aria-label="Estado de la nueva fase"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={styles.addButton}
                  disabled={!newPhase.title.trim() || !newPhase.start || !newPhase.end}
                  onClick={() => submitNewPhase(lane.id)}
                >
                  Agregar
                </button>
              </div>
            </>
          );
        })()}

      {view.level === "activities" &&
        (() => {
          const found = findPhase(view.phaseId);
          if (!found) return null;
          const { lane, phase } = found;
          const activities = getActivities(phase);
          return (
            <>
              <Breadcrumb
                items={[rootCrumb, { label: lane.name, view: { level: "phases", laneId: lane.id } }, { label: phase.title }]}
                onNavigate={onNavigate}
              />
              <h2 className={styles.title}>{phase.title}</h2>
              <StatusPill status={phase.status} />
              <p className={styles.sectionTitle}>
                Actividades ({activities.length})
              </p>
              <div className={styles.list}>
                {activities.map((a) => (
                  <div key={a.id} className={styles.activityRow}>
                    <button
                      type="button"
                      className={styles.activityRowMain}
                      onClick={() => onNavigate({ level: "activity", phaseId: phase.id, activityId: a.id })}
                    >
                      <span className={styles.activityDot} style={{ background: `var(--${STATUS_VAR[a.status]})` }} />
                      <span className={styles.activityRowTitle}>{a.title}</span>
                      <span className={styles.rowMeta}>{a.owner}</span>
                      <span className={styles.rowMeta}>
                        {formatDate(a.start, startMonth)} – {formatDate(a.end, startMonth)}
                      </span>
                      <span className={styles.chevronRight} aria-hidden="true">
                        ›
                      </span>
                    </button>
                    <button
                      type="button"
                      className={styles.deleteButton}
                      onClick={() => onDeleteActivity(phase, a.id)}
                      aria-label={`Eliminar actividad ${a.title}`}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {activities.length === 0 && <p className={styles.empty}>Esta fase no tiene actividades todavía.</p>}
              </div>

              <p className={styles.sectionTitle}>Agregar actividad</p>
              <div className={styles.addRow}>
                <input
                  className={styles.textInput}
                  placeholder="Título"
                  value={newActivity.title}
                  onChange={(e) => setNewActivity((a) => ({ ...a, title: e.target.value }))}
                />
                <input
                  className={styles.ownerInput}
                  placeholder="Owner"
                  value={newActivity.owner}
                  onChange={(e) => setNewActivity((a) => ({ ...a, owner: e.target.value }))}
                />
                <input
                  type="date"
                  className={styles.dateInput}
                  value={newActivity.start}
                  onChange={(e) => setNewActivity((a) => ({ ...a, start: e.target.value }))}
                  aria-label="Fecha de inicio"
                />
                <input
                  type="date"
                  className={styles.dateInput}
                  value={newActivity.end}
                  onChange={(e) => setNewActivity((a) => ({ ...a, end: e.target.value }))}
                  aria-label="Fecha de fin"
                />
                <select
                  className={styles.statusSelect}
                  value={newActivity.status}
                  onChange={(e) => setNewActivity((a) => ({ ...a, status: e.target.value as PhaseStatus }))}
                  aria-label="Estado de la nueva actividad"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={styles.addButton}
                  disabled={!newActivity.title.trim() || !newActivity.owner.trim() || !newActivity.start || !newActivity.end}
                  onClick={() => submitNewActivity(phase)}
                >
                  Agregar
                </button>
              </div>
            </>
          );
        })()}

      {view.level === "activity" &&
        (() => {
          const found = findPhase(view.phaseId);
          if (!found) return null;
          const { lane, phase } = found;
          const activity = getActivities(phase).find((a) => a.id === view.activityId);
          if (!activity) return null;
          const seedComments = activity.comments ?? [];
          const extraComments = commentsByActivity[activity.id] ?? [];
          const allComments = [...seedComments, ...extraComments];
          return (
            <>
              <Breadcrumb
                items={[
                  rootCrumb,
                  { label: lane.name, view: { level: "phases", laneId: lane.id } },
                  { label: phase.title, view: { level: "activities", phaseId: phase.id } },
                  { label: activity.title },
                ]}
                onNavigate={onNavigate}
              />
              <h2 className={styles.title}>{activity.title}</h2>
              <StatusPill status={activity.status} />
              <dl className={styles.detailGrid}>
                <div className={styles.detailItem}>
                  <dt>Owner</dt>
                  <dd>{activity.owner}</dd>
                </div>
                <div className={styles.detailItem}>
                  <dt>Inicio</dt>
                  <dd>{formatDate(activity.start, startMonth)}</dd>
                </div>
                <div className={styles.detailItem}>
                  <dt>Fin</dt>
                  <dd>{formatDate(activity.end, startMonth)}</dd>
                </div>
              </dl>

              <p className={styles.sectionTitle}>Comentarios</p>
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
                <button type="button" disabled={!draft.trim()} onClick={() => submitComment(activity.id)}>
                  Comentar
                </button>
              </div>
            </>
          );
        })()}
    </section>
  );
});

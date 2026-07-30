"use client";

import { forwardRef, useState } from "react";
import type { Lane, Phase, PhaseStatus } from "@/components/poap-renderer/types";
import { MONTH_ABBR, STATUS_LABELS, pluralForm } from "@/lib/i18n";
import type { StageCategoryDef } from "@/lib/portfolio";
import type { ActivityComment, ActivitySeed } from "./mock-data";
import { formatDate, fromISODate, toISODate } from "./dateAxis";
import { IconChevronRight, IconClose, IconPlus, IconSearch, IconSort, IconTrash } from "@/lib/icons";
import { useLanguage } from "./i18n/LanguageProvider";
import styles from "./ExplorerPanel.module.css";

type SortBy = "name" | "date";

/** Shared list-toolbar filter: case-insensitive substring match on
 * whatever name each row exposes, applied before sorting. */
function filterByName<T>(items: T[], search: string, getName: (item: T) => string): T[] {
  const q = search.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => getName(item).toLowerCase().includes(q));
}

function sortItems<T>(items: T[], sortBy: SortBy, getName: (item: T) => string, getDate: (item: T) => number): T[] {
  return [...items].sort((a, b) => (sortBy === "name" ? getName(a).localeCompare(getName(b)) : getDate(a) - getDate(b)));
}

function FilterBar({
  search,
  onSearch,
  searchLabel,
  sortBy,
  onSortBy,
}: {
  search: string;
  onSearch: (v: string) => void;
  searchLabel: string;
  sortBy: SortBy;
  onSortBy: (v: SortBy) => void;
}) {
  const { t } = useLanguage();
  return (
    <div className={styles.filterRow}>
      <label className={styles.searchBox}>
        <IconSearch />
        <input
          type="search"
          className={styles.searchInput}
          placeholder={searchLabel}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      </label>
      <label className={styles.sortBox}>
        <IconSort />
        <select
          className={styles.sortSelect}
          value={sortBy}
          onChange={(e) => onSortBy(e.target.value as SortBy)}
          aria-label={t.explorer.sortAriaLabel}
        >
          <option value="name">{t.explorer.sortByName}</option>
          <option value="date">{t.explorer.sortByDate}</option>
        </select>
      </label>
    </div>
  );
}

const STATUS_VAR: Record<PhaseStatus, string> = {
  done: "text-success",
  in_progress: "text-accent",
  at_risk: "text-warning",
  not_started: "text-secondary",
};
const STATUS_OPTIONS: PhaseStatus[] = ["not_started", "in_progress", "at_risk", "done"];

export type ExplorerView =
  | { level: "lanes" }
  | { level: "phases"; laneId: string }
  | { level: "activities"; phaseId: string }
  | { level: "activity"; phaseId: string; activityId: string };

function StatusPill({ status }: { status: PhaseStatus }) {
  const { locale } = useLanguage();
  return (
    <span
      className={styles.pill}
      style={{
        background: `color-mix(in srgb, var(--${STATUS_VAR[status]}) 18%, var(--card-bg))`,
        color: `var(--${STATUS_VAR[status]})`,
      }}
    >
      <span className={styles.pillDot} style={{ background: `var(--${STATUS_VAR[status]})` }} />
      {STATUS_LABELS[locale][status]}
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
  const { t } = useLanguage();
  return (
    <nav className={styles.breadcrumb} aria-label={t.explorer.breadcrumbNav}>
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
    stageCategories: StageCategoryDef[];
    getActivities: (phase: Phase) => ActivitySeed[];
    onNavigate: (view: ExplorerView) => void;
    onClose: () => void;
    onAddLane: (name: string) => void;
    onUpdatePhase: (
      laneId: string,
      phaseId: string,
      patch: Partial<Pick<Phase, "title" | "start" | "end" | "status" | "category">>,
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
    stageCategories,
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
  const { t, locale } = useLanguage();
  const monthAbbr = MONTH_ABBR[locale];
  const [newLaneName, setNewLaneName] = useState("");
  const [newPhase, setNewPhase] = useState({
    title: "",
    start: "",
    end: "",
    status: "not_started" as PhaseStatus,
    category: "",
  });
  const [newActivity, setNewActivity] = useState({ title: "", owner: "", start: "", end: "", status: "not_started" as PhaseStatus });
  const [commentsByActivity, setCommentsByActivity] = useState<Record<string, ActivityComment[]>>({});
  const [draft, setDraft] = useState("");

  const [laneSearch, setLaneSearch] = useState("");
  const [laneSort, setLaneSort] = useState<SortBy>("name");
  const [phaseSearch, setPhaseSearch] = useState("");
  const [phaseSort, setPhaseSort] = useState<SortBy>("name");
  const [activitySearch, setActivitySearch] = useState("");
  const [activitySort, setActivitySort] = useState<SortBy>("name");

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
      [activityId]: [...(prev[activityId] ?? []), { author: t.explorer.commentAuthorYou, date: t.explorer.commentDateJustNow, text }],
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
      category: newPhase.category || undefined,
    });
    setNewPhase({ title: "", start: "", end: "", status: "not_started", category: "" });
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

  const rootCrumb = { label: t.explorer.root, view: { level: "lanes" } as ExplorerView };

  return (
    <section ref={ref} className={styles.panel}>
      <button className={styles.close} onClick={onClose} aria-label={t.explorer.close}>
        <IconClose />
      </button>

      {view.level === "lanes" &&
        (() => {
          const visibleLanes = sortItems(
            filterByName(lanes, laneSearch, (l) => l.name),
            laneSort,
            (l) => l.name,
            (l) => (l.phases.length ? Math.min(...l.phases.map((p) => p.start)) : Infinity),
          );
          return (
            <>
              <p className={styles.eyebrow}>{t.explorer.lanesEyebrow}</p>
              <h2 className={styles.title}>{t.explorer.lanesTitle}</h2>

              <div className={styles.addGroup}>
                <p className={styles.sectionTitle}>{t.explorer.addLaneSection}</p>
                <div className={styles.addRow}>
                  <input
                    className={styles.textInput}
                    placeholder={t.explorer.laneNamePlaceholder}
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
                    <IconPlus /> {t.explorer.addButton}
                  </button>
                </div>
              </div>

              <div className={styles.listGroup}>
                <FilterBar
                  search={laneSearch}
                  onSearch={setLaneSearch}
                  searchLabel={t.explorer.searchLanePlaceholder}
                  sortBy={laneSort}
                  onSortBy={setLaneSort}
                />
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>{t.explorer.tableName}</th>
                        <th>{t.explorer.tablePhases}</th>
                        <th aria-hidden="true" />
                        <th aria-hidden="true" />
                      </tr>
                    </thead>
                    <tbody>
                      {visibleLanes.map((lane) => (
                        <tr key={lane.id}>
                          <td className={styles.tableNameCell}>{lane.name}</td>
                          <td className={styles.tableMetaCell}>
                            {lane.phases.length}{" "}
                            {pluralForm(lane.phases.length, { one: t.explorer.phaseOne, other: t.explorer.phaseOther })}
                          </td>
                          <td>
                            <button
                              type="button"
                              className={styles.viewButton}
                              onClick={() => onNavigate({ level: "phases", laneId: lane.id })}
                              aria-label={t.explorer.viewPhasesAria(lane.name)}
                            >
                              <IconChevronRight />
                            </button>
                          </td>
                          <td>
                            <button
                              type="button"
                              className={styles.deleteButton}
                              onClick={() => onDeleteLane(lane.id)}
                              aria-label={t.explorer.deleteLaneAria(lane.name)}
                            >
                              <IconTrash />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {visibleLanes.length === 0 && lanes.length > 0 && (
                        <tr>
                          <td colSpan={4} className={styles.emptyCell}>
                            {t.explorer.noLaneMatch}
                          </td>
                        </tr>
                      )}
                      {lanes.length === 0 && (
                        <tr>
                          <td colSpan={4} className={styles.emptyCell}>
                            {t.explorer.noLanes}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          );
        })()}

      {view.level === "phases" &&
        (() => {
          const lane = lanes.find((l) => l.id === view.laneId);
          if (!lane) return null;
          const visiblePhases = sortItems(
            filterByName(lane.phases, phaseSearch, (p) => p.title),
            phaseSort,
            (p) => p.title,
            (p) => p.start,
          );
          const laneRange =
            lane.phases.length > 0
              ? {
                  start: Math.min(...lane.phases.map((p) => p.start)),
                  end: Math.max(...lane.phases.map((p) => p.end)),
                }
              : null;
          return (
            <>
              <Breadcrumb items={[rootCrumb, { label: lane.name }]} onNavigate={onNavigate} />
              <h2 className={styles.title}>{lane.name}</h2>
              <p className={styles.subtitle}>
                {lane.phases.length}{" "}
                {pluralForm(lane.phases.length, { one: t.explorer.phaseOne, other: t.explorer.phaseOther })}
                {laneRange && (
                  <>
                    {" "}
                    · {formatDate(laneRange.start, startMonth, monthAbbr)} – {formatDate(laneRange.end, startMonth, monthAbbr)}
                  </>
                )}
              </p>

              <div className={styles.addGroup}>
                <p className={styles.sectionTitle}>{t.explorer.addPhaseSection}</p>
                <div className={styles.addRow}>
                  <input
                    className={styles.textInput}
                    placeholder={t.explorer.phaseTitlePlaceholder}
                    value={newPhase.title}
                    onChange={(e) => setNewPhase((p) => ({ ...p, title: e.target.value }))}
                  />
                  <input
                    type="date"
                    className={styles.dateInput}
                    value={newPhase.start}
                    onChange={(e) => setNewPhase((p) => ({ ...p, start: e.target.value }))}
                    aria-label={t.explorer.startDateAria}
                  />
                  <input
                    type="date"
                    className={styles.dateInput}
                    value={newPhase.end}
                    onChange={(e) => setNewPhase((p) => ({ ...p, end: e.target.value }))}
                    aria-label={t.explorer.endDateAria}
                  />
                  <select
                    className={styles.statusSelect}
                    value={newPhase.status}
                    onChange={(e) => setNewPhase((p) => ({ ...p, status: e.target.value as PhaseStatus }))}
                    aria-label={t.explorer.newPhaseStatusAria}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[locale][s]}
                      </option>
                    ))}
                  </select>
                  <select
                    className={styles.statusSelect}
                    value={newPhase.category}
                    onChange={(e) => setNewPhase((p) => ({ ...p, category: e.target.value }))}
                    aria-label={t.explorer.categoryAria}
                  >
                    <option value="">{t.explorer.categoryNone}</option>
                    {stageCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={styles.addButton}
                    disabled={!newPhase.title.trim() || !newPhase.start || !newPhase.end}
                    onClick={() => submitNewPhase(lane.id)}
                  >
                    <IconPlus /> {t.explorer.addButton}
                  </button>
                </div>
              </div>

              <div className={styles.listGroup}>
                <FilterBar
                  search={phaseSearch}
                  onSearch={setPhaseSearch}
                  searchLabel={t.explorer.searchPhasePlaceholder}
                  sortBy={phaseSort}
                  onSortBy={setPhaseSort}
                />
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>{t.explorer.tableTitle}</th>
                        <th>{t.explorer.tableStart}</th>
                        <th>{t.explorer.tableEnd}</th>
                        <th>{t.explorer.tableStatus}</th>
                        <th>{t.explorer.tableCategory}</th>
                        <th aria-hidden="true" />
                        <th aria-hidden="true" />
                      </tr>
                    </thead>
                    <tbody>
                      {visiblePhases.map((phase) => (
                        <tr key={phase.id}>
                          <td>
                            <input
                              className={styles.tableTextInput}
                              value={phase.title}
                              onChange={(e) => onUpdatePhase(lane.id, phase.id, { title: e.target.value })}
                              aria-label={t.explorer.phaseTitleAria}
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
                              aria-label={t.explorer.startDateAria}
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
                              aria-label={t.explorer.endDateAria}
                            />
                          </td>
                          <td>
                            <select
                              className={styles.statusSelect}
                              value={phase.status}
                              onChange={(e) => onUpdatePhase(lane.id, phase.id, { status: e.target.value as PhaseStatus })}
                              aria-label={t.explorer.phaseStatusAria}
                            >
                              {STATUS_OPTIONS.map((s) => (
                                <option key={s} value={s}>
                                  {STATUS_LABELS[locale][s]}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <select
                              className={styles.statusSelect}
                              value={phase.category ?? ""}
                              onChange={(e) => onUpdatePhase(lane.id, phase.id, { category: e.target.value || undefined })}
                              aria-label={t.explorer.categoryAria}
                            >
                              <option value="">{t.explorer.categoryNone}</option>
                              {stageCategories.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <button
                              type="button"
                              className={styles.viewButton}
                              onClick={() => onNavigate({ level: "activities", phaseId: phase.id })}
                              aria-label={t.explorer.viewActivitiesAria(phase.title)}
                            >
                              <IconChevronRight />
                            </button>
                          </td>
                          <td>
                            <button
                              type="button"
                              className={styles.deleteButton}
                              onClick={() => onDeletePhase(lane.id, phase.id)}
                              aria-label={t.explorer.deletePhaseAria(phase.title)}
                            >
                              <IconTrash />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {visiblePhases.length === 0 && lane.phases.length > 0 && (
                        <tr>
                          <td colSpan={7} className={styles.emptyCell}>
                            {t.explorer.noPhaseMatch}
                          </td>
                        </tr>
                      )}
                      {lane.phases.length === 0 && (
                        <tr>
                          <td colSpan={7} className={styles.emptyCell}>
                            {t.explorer.noPhases}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
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
              <div className={styles.headerMeta}>
                <StatusPill status={phase.status} />
                <span className={styles.headerDates}>
                  {formatDate(phase.start, startMonth, monthAbbr)} – {formatDate(phase.end, startMonth, monthAbbr)}
                </span>
              </div>

              <div className={styles.addGroup}>
                <p className={styles.sectionTitle}>{t.explorer.addActivitySection}</p>
                <div className={styles.addRow}>
                  <input
                    className={styles.textInput}
                    placeholder={t.explorer.activityTitlePlaceholder}
                    value={newActivity.title}
                    onChange={(e) => setNewActivity((a) => ({ ...a, title: e.target.value }))}
                  />
                  <input
                    className={styles.ownerInput}
                    placeholder={t.explorer.ownerPlaceholder}
                    value={newActivity.owner}
                    onChange={(e) => setNewActivity((a) => ({ ...a, owner: e.target.value }))}
                  />
                  <input
                    type="date"
                    className={styles.dateInput}
                    value={newActivity.start}
                    onChange={(e) => setNewActivity((a) => ({ ...a, start: e.target.value }))}
                    aria-label={t.explorer.startDateAria}
                  />
                  <input
                    type="date"
                    className={styles.dateInput}
                    value={newActivity.end}
                    onChange={(e) => setNewActivity((a) => ({ ...a, end: e.target.value }))}
                    aria-label={t.explorer.endDateAria}
                  />
                  <select
                    className={styles.statusSelect}
                    value={newActivity.status}
                    onChange={(e) => setNewActivity((a) => ({ ...a, status: e.target.value as PhaseStatus }))}
                    aria-label={t.explorer.newActivityStatusAria}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[locale][s]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={styles.addButton}
                    disabled={!newActivity.title.trim() || !newActivity.owner.trim() || !newActivity.start || !newActivity.end}
                    onClick={() => submitNewActivity(phase)}
                  >
                    <IconPlus /> {t.explorer.addButton}
                  </button>
                </div>
              </div>

              <p className={styles.sectionTitle}>{t.explorer.activitiesHeading(activities.length)}</p>
              <div className={styles.listGroup}>
                <FilterBar
                  search={activitySearch}
                  onSearch={setActivitySearch}
                  searchLabel={t.explorer.searchActivityPlaceholder}
                  sortBy={activitySort}
                  onSortBy={setActivitySort}
                />
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>{t.explorer.tableTitle}</th>
                        <th>{t.explorer.tableOwner}</th>
                        <th>{t.explorer.tableStart}</th>
                        <th>{t.explorer.tableEnd}</th>
                        <th>{t.explorer.tableStatus}</th>
                        <th aria-hidden="true" />
                        <th aria-hidden="true" />
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const visibleActivities = sortItems(
                          filterByName(activities, activitySearch, (a) => a.title),
                          activitySort,
                          (a) => a.title,
                          (a) => a.start,
                        );
                        return (
                          <>
                            {visibleActivities.map((a) => (
                              <tr key={a.id}>
                                <td className={styles.tableNameCell}>{a.title}</td>
                                <td className={styles.tableMetaCell}>{a.owner}</td>
                                <td className={styles.tableMetaCell}>{formatDate(a.start, startMonth, monthAbbr)}</td>
                                <td className={styles.tableMetaCell}>{formatDate(a.end, startMonth, monthAbbr)}</td>
                                <td>
                                  <span className={styles.tableStatusCell}>
                                    <span
                                      className={styles.activityDot}
                                      style={{ background: `var(--${STATUS_VAR[a.status]})` }}
                                      aria-hidden="true"
                                    />
                                    {STATUS_LABELS[locale][a.status]}
                                  </span>
                                </td>
                                <td>
                                  <button
                                    type="button"
                                    className={styles.viewButton}
                                    onClick={() => onNavigate({ level: "activity", phaseId: phase.id, activityId: a.id })}
                                    aria-label={t.explorer.viewActivityAria(a.title)}
                                  >
                                    <IconChevronRight />
                                  </button>
                                </td>
                                <td>
                                  <button
                                    type="button"
                                    className={styles.deleteButton}
                                    onClick={() => onDeleteActivity(phase, a.id)}
                                    aria-label={t.explorer.deleteActivityAria(a.title)}
                                  >
                                    <IconTrash />
                                  </button>
                                </td>
                              </tr>
                            ))}
                            {visibleActivities.length === 0 && activities.length > 0 && (
                              <tr>
                                <td colSpan={7} className={styles.emptyCell}>
                                  {t.explorer.noActivityMatch}
                                </td>
                              </tr>
                            )}
                            {activities.length === 0 && (
                              <tr>
                                <td colSpan={7} className={styles.emptyCell}>
                                  {t.explorer.noActivities}
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })()}
                    </tbody>
                  </table>
                </div>
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
              <div className={styles.headerMeta}>
                <StatusPill status={activity.status} />
                <span className={styles.headerDates}>
                  {formatDate(activity.start, startMonth, monthAbbr)} – {formatDate(activity.end, startMonth, monthAbbr)}
                </span>
              </div>
              <dl className={styles.detailGrid}>
                <div className={styles.detailItem}>
                  <dt>{t.explorer.ownerLabel}</dt>
                  <dd>{activity.owner}</dd>
                </div>
              </dl>

              <p className={styles.sectionTitle}>{t.explorer.commentsSection}</p>
              {allComments.length === 0 && <p className={styles.noComments}>{t.explorer.noComments}</p>}
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
                  placeholder={t.explorer.commentPlaceholder}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <button type="button" disabled={!draft.trim()} onClick={() => submitComment(activity.id)}>
                  {t.explorer.commentButton}
                </button>
              </div>
            </>
          );
        })()}
    </section>
  );
});

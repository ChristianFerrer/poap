"use client";

import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { PoapRenderer } from "@/components/poap-renderer/PoapRenderer";
import type { Gate, Lane, Phase } from "@/components/poap-renderer/types";
import {
  ACTIVITIES_BY_PHASE as INITIAL_ACTIVITIES,
  activitiesFor,
  BANDS,
  GATES as INITIAL_GATES,
  LANES as INITIAL_LANES,
  MONTHS,
  START_MONTH,
  type ActivitySeed,
} from "./mock-data";
import { ExplorerPanel, type ExplorerView } from "./ExplorerPanel";
import { GatesPanel } from "./GatesPanel";
import { ImportPanel } from "./ImportPanel";
import { useLanguage } from "./i18n/LanguageProvider";
import { MONTH_ABBR, type Locale } from "@/lib/i18n";
import styles from "./page.module.css";

const PANEL_WIDTH_DEFAULT = 400;
const PANEL_WIDTH_MIN = 320;

// The panel can grow up to half the viewport, never more — read live off
// window.innerWidth rather than a fixed px cap, since "half the screen" is
// relative to whatever device this loads on.
function panelWidthMax(): number {
  return typeof window === "undefined" ? PANEL_WIDTH_DEFAULT : Math.floor(window.innerWidth * 0.5);
}

/** "jun 2026 — may 2027" / "Jun 2026 — May 2027" — built from the plan's
 * own START_MONTH/MONTHS rather than hardcoded, so it can't drift out of
 * sync with the data and picks up locale-appropriate month abbreviations. */
function formatMonthRange(startMonth: string, months: number, monthAbbr: string[]): string {
  const [y, m] = startMonth.split("-").map(Number) as [number, number];
  const startIdx = m - 1;
  const endIdx = startIdx + months - 1;
  const endYear = y + Math.floor(endIdx / 12);
  return `${monthAbbr[startIdx % 12]} ${y} — ${monthAbbr[endIdx % 12]} ${endYear}`;
}

export default function Page() {
  const { locale, setLocale, t } = useLanguage();
  const [lanes, setLanes] = useState<Lane[]>(INITIAL_LANES);
  const [activitiesByPhase, setActivitiesByPhase] = useState<Record<string, ActivitySeed[]>>(INITIAL_ACTIVITIES);
  const [explorer, setExplorer] = useState<ExplorerView | null>(null);
  const [gates, setGates] = useState<Gate[]>(INITIAL_GATES);
  const [activeGateIds, setActiveGateIds] = useState<string[]>([]);
  const [gatesPanelOpen, setGatesPanelOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  // Opens at its maximum width (half the viewport) rather than some smaller
  // default — the drag handle still lets you shrink it back down from
  // there. Lazy initializer so this reads window.innerWidth once, at
  // mount, rather than on every render.
  const [panelWidth, setPanelWidth] = useState(panelWidthMax);
  const phaseCount = lanes.reduce((n, l) => n + l.phases.length, 0);
  const panelRef = useRef<HTMLDivElement>(null);

  // If the window shrinks (e.g. rotating a tablet) below the panel's
  // current width, re-clamp it to the new 50% cap instead of leaving it
  // wider than half the screen until the next drag.
  useEffect(() => {
    function onResize() {
      setPanelWidth((w) => Math.min(w, panelWidthMax()));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Drag-to-resize the side panel — the handle sits on the panel's left
  // edge, so dragging left (away from the right-anchored panel) grows it.
  // onMove/onUp are scoped to this one gesture and detached on mouseup
  // rather than living as a persistent listener.
  function startResize(e: ReactMouseEvent<HTMLDivElement>) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = panelWidth;
    function onMove(ev: MouseEvent) {
      const next = startWidth + (startX - ev.clientX);
      setPanelWidth(Math.min(panelWidthMax(), Math.max(PANEL_WIDTH_MIN, next)));
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // The bar shown "selected" in the chart mirrors whichever phase the
  // explorer is currently drilled into, so it stays highlighted while you
  // browse its activities — not just at the instant you click it.
  const selectedPhaseId =
    explorer?.level === "activities" || explorer?.level === "activity" ? explorer.phaseId : null;

  function scrollToPanel() {
    requestAnimationFrame(() => {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function openExplorer(view: ExplorerView) {
    setExplorer(view);
    setGatesPanelOpen(false);
    setImportOpen(false);
    // On narrow viewports the panel stacks below the calendar instead of
    // sitting beside it — bring it into view there, since it can otherwise
    // open off-screen with no indication anything happened.
    scrollToPanel();
  }

  function openImportPanel() {
    setImportOpen(true);
    setExplorer(null);
    setGatesPanelOpen(false);
    scrollToPanel();
  }

  function importLanes(newLanes: Lane[]) {
    setLanes((prev) => [...prev, ...newLanes.map((lane, i) => ({ ...lane, sortOrder: prev.length + i }))]);
  }

  function handlePhaseClick(phaseId: string) {
    openExplorer({ level: "activities", phaseId });
  }

  function handleLaneClick(laneId: string) {
    openExplorer({ level: "phases", laneId });
  }

  function addLane(name: string) {
    setLanes((prev) => [...prev, { id: crypto.randomUUID(), name, sortOrder: prev.length, phases: [] }]);
  }

  function updatePhase(laneId: string, phaseId: string, patch: Partial<Pick<Phase, "title" | "start" | "end" | "status">>) {
    setLanes((prev) =>
      prev.map((lane) =>
        lane.id !== laneId
          ? lane
          : { ...lane, phases: lane.phases.map((p) => (p.id === phaseId ? { ...p, ...patch } : p)) },
      ),
    );
  }

  function addPhase(laneId: string, phase: Phase) {
    setLanes((prev) => prev.map((lane) => (lane.id === laneId ? { ...lane, phases: [...lane.phases, phase] } : lane)));
  }

  function deleteLane(laneId: string) {
    const lane = lanes.find((l) => l.id === laneId);
    setLanes((prev) => prev.filter((l) => l.id !== laneId));
    if (lane) {
      const deletedPhaseIds = new Set(lane.phases.map((p) => p.id));
      setActivitiesByPhase((prev) =>
        Object.fromEntries(Object.entries(prev).filter(([phaseId]) => !deletedPhaseIds.has(phaseId))),
      );
    }
    // Whatever the explorer was showing for this lane (or a phase under
    // it) no longer exists — back out to the swimline list rather than
    // pointing at something that just disappeared.
    setExplorer((prev) => {
      if (!prev || prev.level === "lanes") return prev;
      if (prev.level === "phases") return prev.laneId === laneId ? { level: "lanes" } : prev;
      const wasUnderDeletedLane = lane?.phases.some((p) => p.id === prev.phaseId) ?? false;
      return wasUnderDeletedLane ? { level: "lanes" } : prev;
    });
  }

  // Phases without a hand-authored entry here get a two-step breakdown
  // computed on the fly from their own dates (see mock-data's
  // activitiesFor) — this materializes that fallback into real state only
  // once an activity actually needs to be added to it.
  function getActivities(phase: Phase): ActivitySeed[] {
    return activitiesByPhase[phase.id] ?? activitiesFor(phase);
  }

  function deletePhase(laneId: string, phaseId: string) {
    setLanes((prev) =>
      prev.map((lane) => (lane.id === laneId ? { ...lane, phases: lane.phases.filter((p) => p.id !== phaseId) } : lane)),
    );
    setActivitiesByPhase((prev) => {
      if (!(phaseId in prev)) return prev;
      const next = { ...prev };
      delete next[phaseId];
      return next;
    });
    setExplorer((prev) => {
      if (!prev || prev.level === "lanes" || prev.level === "phases") return prev;
      return prev.phaseId === phaseId ? { level: "phases", laneId } : prev;
    });
  }

  function addActivity(phase: Phase, activity: ActivitySeed) {
    setActivitiesByPhase((prev) => ({
      ...prev,
      [phase.id]: [...(prev[phase.id] ?? activitiesFor(phase)), activity],
    }));
  }

  function deleteActivity(phase: Phase, activityId: string) {
    setActivitiesByPhase((prev) => ({
      ...prev,
      [phase.id]: (prev[phase.id] ?? activitiesFor(phase)).filter((a) => a.id !== activityId),
    }));
    setExplorer((prev) =>
      prev && prev.level === "activity" && prev.activityId === activityId ? { level: "activities", phaseId: phase.id } : prev,
    );
  }

  function toggleGateActive(gateId: string) {
    setActiveGateIds((prev) => (prev.includes(gateId) ? prev.filter((id) => id !== gateId) : [...prev, gateId]));
  }

  function handleGateClick(gateId: string) {
    toggleGateActive(gateId);
    setExplorer(null);
    setImportOpen(false);
    setGatesPanelOpen(true);
    scrollToPanel();
  }

  // Opens the gates panel without toggling any one gate's visibility —
  // for clicking the "Stage gates" row label itself, same idea as
  // handleLaneClick opening a lane's phases.
  function openGatesPanel() {
    setExplorer(null);
    setImportOpen(false);
    setGatesPanelOpen(true);
    scrollToPanel();
  }

  function updateGate(id: string, patch: Partial<Pick<Gate, "label" | "position">>) {
    setGates((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  }

  function addGate(gate: Gate) {
    setGates((prev) => [...prev, gate]);
  }

  function deleteGate(id: string) {
    setGates((prev) => prev.filter((g) => g.id !== id));
    setActiveGateIds((prev) => prev.filter((gid) => gid !== id));
  }

  return (
    <main className={styles.main}>
      <div className={styles.headerRow}>
        <div>
          <p className={styles.eyebrow}>{t.header.eyebrow}</p>
          <h1 className={styles.title}>{t.header.title}</h1>
          <p className={styles.meta}>
            {lanes.length} {t.header.lanesWord} · {phaseCount} {t.header.phasesWord} · {MONTHS}{" "}
            {t.header.monthsWord} · {formatMonthRange(START_MONTH, MONTHS, MONTH_ABBR[locale])}
          </p>
        </div>
        <div className={styles.headerActions}>
          <LanguageSwitch locale={locale} onChange={setLocale} ariaLabel={t.header.languageAria} />
          <button type="button" className={styles.importButton} onClick={openImportPanel}>
            {t.header.importButton}
          </button>
        </div>
      </div>

      <div className={styles.layout}>
        <div className={styles.calendarCol}>
          <PoapRenderer
            months={MONTHS}
            startMonth={START_MONTH}
            lanes={lanes}
            gates={gates}
            bands={BANDS}
            selectedPhaseId={selectedPhaseId}
            onPhaseClick={handlePhaseClick}
            activeGateIds={activeGateIds}
            onGateClick={handleGateClick}
            onLaneClick={handleLaneClick}
            onGatesLabelClick={openGatesPanel}
            locale={locale}
          />
        </div>
      </div>

      {/* Fixed, right-anchored overlay — not part of the flex layout above,
          so it floats over the calendar instead of squeezing it, and
          deliberately has no dimming backdrop behind it: the calendar stays
          fully interactive/visible while the panel is open. */}
      {(explorer || gatesPanelOpen || importOpen) && (
        <div className={styles.sidePanel} style={{ width: panelWidth }}>
          <div
            className={styles.resizeHandle}
            onMouseDown={startResize}
            role="separator"
            aria-orientation="vertical"
            aria-label={t.header.resizeHandleAria}
          />
          <div className={styles.sidePanelContent}>
            {explorer && (
              <ExplorerPanel
                ref={panelRef}
                lanes={lanes}
                startMonth={START_MONTH}
                view={explorer}
                getActivities={getActivities}
                onNavigate={setExplorer}
                onClose={() => setExplorer(null)}
                onAddLane={addLane}
                onUpdatePhase={updatePhase}
                onAddPhase={addPhase}
                onAddActivity={addActivity}
                onDeleteLane={deleteLane}
                onDeletePhase={deletePhase}
                onDeleteActivity={deleteActivity}
              />
            )}

            {gatesPanelOpen && (
              <GatesPanel
                ref={panelRef}
                gates={gates}
                activeGateIds={new Set(activeGateIds)}
                startMonth={START_MONTH}
                onClose={() => setGatesPanelOpen(false)}
                onToggle={toggleGateActive}
                onUpdate={updateGate}
                onAdd={addGate}
                onDelete={deleteGate}
              />
            )}

            {importOpen && (
              <ImportPanel
                ref={panelRef}
                startMonth={START_MONTH}
                months={MONTHS}
                onClose={() => setImportOpen(false)}
                onImport={importLanes}
              />
            )}
          </div>
        </div>
      )}
    </main>
  );
}

/** ES/EN toggle — two buttons rather than a <select>, since there are only
 * ever two options and the current one should be visible at a glance
 * without opening anything. */
function LanguageSwitch({
  locale,
  onChange,
  ariaLabel,
}: {
  locale: Locale;
  onChange: (locale: Locale) => void;
  ariaLabel: string;
}) {
  return (
    <div className={styles.languageSwitch} role="group" aria-label={ariaLabel}>
      {(["es", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          className={`${styles.languageButton} ${l === locale ? styles.languageButtonActive : ""}`}
          onClick={() => onChange(l)}
          aria-pressed={l === locale}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

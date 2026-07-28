"use client";

import { useRef, useState } from "react";
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
import styles from "./page.module.css";

export default function Page() {
  const [lanes, setLanes] = useState<Lane[]>(INITIAL_LANES);
  const [activitiesByPhase, setActivitiesByPhase] = useState<Record<string, ActivitySeed[]>>(INITIAL_ACTIVITIES);
  const [explorer, setExplorer] = useState<ExplorerView | null>(null);
  const [gates, setGates] = useState<Gate[]>(INITIAL_GATES);
  const [activeGateIds, setActiveGateIds] = useState<string[]>([]);
  const [gatesPanelOpen, setGatesPanelOpen] = useState(false);
  const phaseCount = lanes.reduce((n, l) => n + l.phases.length, 0);
  const panelRef = useRef<HTMLDivElement>(null);

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
    // The panel now renders below the plan instead of an overlay, so bring
    // it into view — otherwise a click low on a tall plan leaves the panel
    // off-screen with no indication anything happened.
    scrollToPanel();
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

  // Phases without a hand-authored entry here get a two-step breakdown
  // computed on the fly from their own dates (see mock-data's
  // activitiesFor) — this materializes that fallback into real state only
  // once an activity actually needs to be added to it.
  function getActivities(phase: Phase): ActivitySeed[] {
    return activitiesByPhase[phase.id] ?? activitiesFor(phase);
  }

  function addActivity(phase: Phase, activity: ActivitySeed) {
    setActivitiesByPhase((prev) => ({
      ...prev,
      [phase.id]: [...(prev[phase.id] ?? activitiesFor(phase)), activity],
    }));
  }

  function toggleGateActive(gateId: string) {
    setActiveGateIds((prev) => (prev.includes(gateId) ? prev.filter((id) => id !== gateId) : [...prev, gateId]));
  }

  function handleGateClick(gateId: string) {
    toggleGateActive(gateId);
    setExplorer(null);
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
      <p className={styles.eyebrow}>PoAP · Plan on a Page</p>
      <h1 className={styles.title}>Programa UK/PL — plan on a page</h1>
      <p className={styles.meta}>
        {lanes.length} carriles · {phaseCount} fases · {MONTHS} meses · jun 2026 — may 2027
      </p>

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
      />

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
    </main>
  );
}

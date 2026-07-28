"use client";

import { useRef, useState } from "react";
import { PoapRenderer } from "@/components/poap-renderer/PoapRenderer";
import type { Gate } from "@/components/poap-renderer/types";
import { BANDS, GATES as INITIAL_GATES, LANES, MONTHS, START_MONTH } from "./mock-data";
import { PhasePanel } from "./PhasePanel";
import { GatesPanel } from "./GatesPanel";
import styles from "./page.module.css";

export default function Page() {
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);
  const [gates, setGates] = useState<Gate[]>(INITIAL_GATES);
  const [activeGateIds, setActiveGateIds] = useState<string[]>([]);
  const [gatesPanelOpen, setGatesPanelOpen] = useState(false);
  const phaseCount = LANES.reduce((n, l) => n + l.phases.length, 0);
  const panelRef = useRef<HTMLDivElement>(null);

  function scrollToPanel() {
    requestAnimationFrame(() => {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function handlePhaseClick(phaseId: string) {
    setSelectedPhaseId(phaseId);
    setGatesPanelOpen(false);
    // The panel now renders below the plan instead of an overlay, so bring
    // it into view — otherwise a click low on a tall plan leaves the panel
    // off-screen with no indication anything happened.
    scrollToPanel();
  }

  function toggleGateActive(gateId: string) {
    setActiveGateIds((prev) => (prev.includes(gateId) ? prev.filter((id) => id !== gateId) : [...prev, gateId]));
  }

  function handleGateClick(gateId: string) {
    toggleGateActive(gateId);
    setSelectedPhaseId(null);
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
        {LANES.length} carriles · {phaseCount} fases · {MONTHS} meses · jun 2026 — may 2027
      </p>

      <PoapRenderer
        months={MONTHS}
        startMonth={START_MONTH}
        lanes={LANES}
        gates={gates}
        bands={BANDS}
        selectedPhaseId={selectedPhaseId}
        onPhaseClick={handlePhaseClick}
        activeGateIds={activeGateIds}
        onGateClick={handleGateClick}
      />

      {selectedPhaseId && (
        <PhasePanel
          ref={panelRef}
          lanes={LANES}
          phaseId={selectedPhaseId}
          onClose={() => setSelectedPhaseId(null)}
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

"use client";

import { useRef, useState } from "react";
import { PoapRenderer } from "@/components/poap-renderer/PoapRenderer";
import { BANDS, GATES, LANES, MONTHS, START_MONTH } from "./mock-data";
import { PhasePanel } from "./PhasePanel";
import styles from "./page.module.css";

export default function Page() {
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);
  const phaseCount = LANES.reduce((n, l) => n + l.phases.length, 0);
  const panelRef = useRef<HTMLDivElement>(null);

  function handlePhaseClick(phaseId: string) {
    setSelectedPhaseId(phaseId);
    // The panel now renders below the plan instead of an overlay, so bring
    // it into view — otherwise a click low on a tall plan leaves the panel
    // off-screen with no indication anything happened.
    requestAnimationFrame(() => {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
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
        gates={GATES}
        bands={BANDS}
        selectedPhaseId={selectedPhaseId}
        onPhaseClick={handlePhaseClick}
      />

      {selectedPhaseId && (
        <PhasePanel
          ref={panelRef}
          lanes={LANES}
          phaseId={selectedPhaseId}
          onClose={() => setSelectedPhaseId(null)}
        />
      )}
    </main>
  );
}

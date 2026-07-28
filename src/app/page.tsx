"use client";

import { useState } from "react";
import { PoapRenderer } from "@/components/poap-renderer/PoapRenderer";
import { BANDS, GATES, LANES, MONTHS, START_MONTH } from "./mock-data";
import { PhasePanel } from "./PhasePanel";

export default function Page() {
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);
  const phaseCount = LANES.reduce((n, l) => n + l.phases.length, 0);

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "24px 20px 60px" }}>
      <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: "0 0 4px" }}>
        PoAP · Plan on a Page
      </p>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 4px" }}>
        Programa UK/PL — plan on a page
      </h1>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 18px" }}>
        {LANES.length} carriles · {phaseCount} fases · {MONTHS} meses · jun 2026 — may 2027
      </p>

      <PoapRenderer
        months={MONTHS}
        startMonth={START_MONTH}
        lanes={LANES}
        gates={GATES}
        bands={BANDS}
        selectedPhaseId={selectedPhaseId}
        onPhaseClick={setSelectedPhaseId}
      />

      {selectedPhaseId && (
        <PhasePanel lanes={LANES} phaseId={selectedPhaseId} onClose={() => setSelectedPhaseId(null)} />
      )}
    </main>
  );
}

"use client";

import { forwardRef, useState } from "react";
import type { Gate } from "@/components/poap-renderer/types";
import { fromAxis, toAxis } from "@/components/poap-renderer/toAxis";
import styles from "./GatesPanel.module.css";

function toISODate(position: number, startMonth: string): string {
  return fromAxis(position, startMonth).toISOString().slice(0, 10);
}
function fromISODate(iso: string, startMonth: string): number {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return toAxis(new Date(Date.UTC(y, m - 1, d)), startMonth);
}

/**
 * Management panel for stage gates — opened by clicking any gate in the
 * chart (same "click opens the panel below" pattern as PhasePanel). Lists
 * every gate with its date and whether it's currently showing its cut-line
 * in the chart, and allows editing, adding, and deleting gates directly.
 *
 * Lives outside poap-renderer, same reasoning as PhasePanel: the renderer
 * only exposes activeGateIds/onGateClick, it doesn't own gate data or know
 * editing exists. A real app would swap the state this panel mutates for a
 * Supabase-backed table.
 */
export const GatesPanel = forwardRef<HTMLDivElement, {
  gates: Gate[];
  activeGateIds: Set<string>;
  startMonth: string;
  onClose: () => void;
  onToggle: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Pick<Gate, "label" | "position">>) => void;
  onAdd: (gate: Gate) => void;
  onDelete: (id: string) => void;
}>(function GatesPanel({ gates, activeGateIds, startMonth, onClose, onToggle, onUpdate, onAdd, onDelete }, ref) {
  const [newLabel, setNewLabel] = useState("");
  const [newDate, setNewDate] = useState("");

  const sorted = [...gates].sort((a, b) => a.position - b.position);

  function submitNew() {
    const label = newLabel.trim();
    if (!label || !newDate) return;
    onAdd({
      id: crypto.randomUUID(),
      label,
      position: fromISODate(newDate, startMonth),
    });
    setNewLabel("");
    setNewDate("");
  }

  return (
    <section ref={ref} className={styles.panel}>
      <button className={styles.close} onClick={onClose} aria-label="Cerrar">✕</button>
      <p className={styles.eyebrow}>Hitos del programa</p>
      <h2 className={styles.title}>Stage Gates</h2>

      <div className={styles.list}>
        {sorted.map((gate) => {
          const active = activeGateIds.has(gate.id);
          return (
            <div key={gate.id} className={styles.row}>
              <button
                type="button"
                className={`${styles.visToggle} ${active ? styles.visToggleActive : ""}`}
                onClick={() => onToggle(gate.id)}
                aria-pressed={active}
                aria-label={active ? "Ocultar línea en el plan" : "Mostrar línea en el plan"}
                title={active ? "Visible en el plan" : "Oculto en el plan"}
              >
                ✓
              </button>
              <input
                className={styles.labelInput}
                value={gate.label}
                onChange={(e) => onUpdate(gate.id, { label: e.target.value })}
                aria-label="Nombre del hito"
              />
              <input
                type="date"
                className={styles.dateInput}
                value={toISODate(gate.position, startMonth)}
                onChange={(e) => {
                  if (e.target.value) onUpdate(gate.id, { position: fromISODate(e.target.value, startMonth) });
                }}
                aria-label="Fecha del hito"
              />
              <button
                type="button"
                className={styles.delete}
                onClick={() => onDelete(gate.id)}
                aria-label={`Eliminar ${gate.label}`}
              >
                ✕
              </button>
            </div>
          );
        })}
        {sorted.length === 0 && <p className={styles.empty}>No hay hitos todavía.</p>}
      </div>

      <p className={styles.sectionTitle}>Agregar hito</p>
      <div className={styles.addRow}>
        <input
          className={styles.labelInput}
          placeholder="Nombre del hito"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
        />
        <input
          type="date"
          className={styles.dateInput}
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
        />
        <button type="button" className={styles.addButton} disabled={!newLabel.trim() || !newDate} onClick={submitNew}>
          Agregar
        </button>
      </div>
    </section>
  );
});

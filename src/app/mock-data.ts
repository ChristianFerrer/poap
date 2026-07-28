import { toAxis } from "@/components/poap-renderer/toAxis";
import type { Band, Gate, Lane, Phase, PhaseStatus } from "@/components/poap-renderer/types";

export const START_MONTH = "2026-06";
export const MONTHS = 12;

function d(y: number, m: number, day: number): Date {
  return new Date(Date.UTC(y, m - 1, day));
}
function axis(y: number, m: number, day: number): number {
  return toAxis(d(y, m, day), START_MONTH);
}

export interface ActivityComment {
  author: string;
  date: string;
  text: string;
}

export interface ActivitySeed {
  id: string;
  title: string;
  owner: string;
  start: number;
  end: number;
  status: PhaseStatus;
  comments?: ActivityComment[];
}

export const ACTIVITIES_BY_PHASE: Record<string, ActivitySeed[]> = {
  "sit-exec": [
    { id: "a1", title: "Ejecutar casos SIT lote 1", owner: "J. Alonso", start: axis(2026, 6, 22), end: axis(2026, 7, 3), status: "done" },
    {
      id: "a2",
      title: "SIT Bug Fix",
      owner: "J. Alonso",
      start: axis(2026, 7, 6),
      end: axis(2026, 7, 24),
      status: "at_risk",
      comments: [
        { author: "J. Alonso", date: "22 jul", text: "Quedan 3 defectos P2 abiertos, dependemos de Data Engineering." },
        { author: "C. Ferrer", date: "23 jul", text: "¿Alguno bloquea la entrada a UAT del 24/8?" },
        { author: "J. Alonso", date: "24 jul", text: "No, son cosméticos. Cerramos antes del 30/7." },
      ],
    },
  ],
  "red-sit": [
    {
      id: "a3",
      title: "Configurar conectividad AC2",
      owner: "Redes",
      start: axis(2026, 8, 3),
      end: axis(2026, 8, 21),
      status: "at_risk",
      comments: [
        { author: "Redes", date: "12 ago", text: "Bloqueado por aprobación de firewall pendiente desde el 5/8." },
      ],
    },
    { id: "a4", title: "SIT sobre conectividad", owner: "Equipo Datos", start: axis(2026, 8, 21), end: axis(2026, 9, 25), status: "not_started" },
  ],
};

/** Phases without hand-authored activity seeds still get a plausible
 * two-step breakdown spanning the phase's own dates, rather than a fixed
 * placeholder range that wouldn't line up with that phase at all. */
function defaultActivities(phase: Phase): ActivitySeed[] {
  const mid = phase.start + (phase.end - phase.start) / 2;
  const owner = phase.owners?.[0] ?? "Equipo asignado";
  return [
    { id: `${phase.id}-d1`, title: "Preparación", owner, start: phase.start, end: mid, status: "done" },
    { id: `${phase.id}-d2`, title: "Ejecución", owner, start: mid, end: phase.end, status: "in_progress" },
  ];
}

export function activitiesFor(phase: Phase): ActivitySeed[] {
  return ACTIVITIES_BY_PHASE[phase.id] ?? defaultActivities(phase);
}

export const LANES: Lane[] = [
  {
    id: "prod",
    name: "Producto / Proceso",
    sortOrder: 0,
    phases: [
      { id: "smoke", title: "Smoke Test + SIT Prep", start: axis(2026, 6, 1), end: axis(2026, 6, 19), status: "done", owners: ["Equipo Producto"] },
      { id: "sit-exec", title: "SIT Ejecución", start: axis(2026, 6, 22), end: axis(2026, 7, 24), status: "at_risk", owners: ["Equipo Producto", "J. Alonso"] },
      { id: "rt-readiness", title: "RT Readiness", start: axis(2026, 7, 6), end: axis(2026, 9, 4), status: "in_progress", owners: ["Equipo Producto"] },
      { id: "tco-readiness", title: "TCO Readiness", start: axis(2026, 7, 13), end: axis(2026, 8, 21), status: "in_progress", owners: ["Equipo Producto"] },
      { id: "uat-prep", title: "UAT Preparación", start: axis(2026, 7, 27), end: axis(2026, 8, 21), status: "at_risk", owners: ["Equipo Producto"] },
      { id: "uat", title: "UAT", start: axis(2026, 8, 24), end: axis(2026, 10, 16), status: "not_started", owners: ["Equipo Producto", "Negocio UK/PL"] },
      { id: "bu-ramp", title: "BU Adoption Ramp Up", start: axis(2026, 12, 7), end: axis(2027, 5, 31), status: "not_started", owners: ["Negocio UK/PL"] },
    ],
  },
  {
    id: "datos",
    name: "Datos",
    sortOrder: 1,
    phases: [
      { id: "ac2-enable", title: "Habilitación Data Science (AC2)", start: axis(2026, 6, 1), end: axis(2026, 7, 10), status: "done", subLane: "AC2", owners: ["Equipo Datos"] },
      { id: "ac2-sit", title: "AC2 SIT Prep + Ejecución", start: axis(2026, 8, 3), end: axis(2026, 9, 25), status: "at_risk", subLane: "AC2", owners: ["Equipo Datos"] },
      { id: "ac2-uat", title: "AC2 UAT Prep + Ejecución", start: axis(2026, 9, 28), end: axis(2026, 11, 13), status: "not_started", subLane: "AC2", owners: ["Equipo Datos"] },
      { id: "red-sit", title: "Red & SIT", start: axis(2026, 8, 3), end: axis(2026, 9, 25), status: "at_risk", owners: ["Equipo Datos", "Redes"] },
      { id: "uat-bdv", title: "UAT BDV", start: axis(2026, 8, 3), end: axis(2026, 8, 31), status: "in_progress", owners: ["Equipo Datos"] },
      { id: "dfu", title: "Mantenimiento DFU continuo", start: axis(2026, 7, 13), end: axis(2027, 5, 31), status: "in_progress", owners: ["Equipo Datos"] },
      { id: "tco", title: "TCO", start: axis(2026, 11, 30), end: axis(2026, 12, 11), status: "not_started", owners: ["Equipo Datos"] },
    ],
  },
  {
    id: "ds",
    name: "Data Science",
    sortOrder: 2,
    phases: [
      { id: "pfe-v2", title: "PFE Calibración v2", start: axis(2026, 6, 1), end: axis(2026, 7, 31), status: "done", owners: ["Equipo DS"] },
      { id: "promo-v3a", title: "SIT Promo v3a", start: axis(2026, 7, 13), end: axis(2026, 8, 14), status: "in_progress", owners: ["Equipo DS"] },
      { id: "pfe-v3bc", title: "PFE Calibración v3b/v3c", start: axis(2026, 8, 17), end: axis(2027, 4, 30), status: "at_risk", owners: ["Equipo DS"] },
      { id: "ac1-uk", title: "AC1 Build & Calibración PFE (UK)", start: axis(2026, 8, 24), end: axis(2027, 3, 31), status: "in_progress", subLane: "UK/PL", owners: ["Equipo DS", "Negocio UK"] },
      { id: "ac1-pl", title: "AC1 Build & Calibración PFE (PL)", start: axis(2026, 9, 21), end: axis(2027, 3, 31), status: "in_progress", subLane: "UK/PL", owners: ["Equipo DS", "Negocio PL"] },
      { id: "ac2-pfe", title: "AC2 Habilitación PFE (incl. HC)", start: axis(2026, 6, 15), end: axis(2026, 8, 14), status: "done", owners: ["Equipo DS"] },
    ],
  },
  {
    id: "cyl",
    name: "Cambio y Formación",
    sortOrder: 3,
    phases: [
      { id: "form-t1", title: "Formación UAT UK/PL — Tanda 1", start: axis(2026, 6, 1), end: axis(2026, 6, 26), status: "done", owners: ["Equipo C&L"] },
      { id: "form-t2", title: "Formación UAT UK/PL — Tanda 2", start: axis(2026, 9, 14), end: axis(2026, 9, 25), status: "not_started", owners: ["Equipo C&L"] },
      { id: "eu-pl-training", title: "EU PL Training", start: axis(2026, 10, 5), end: axis(2027, 1, 8), status: "not_started", owners: ["Equipo C&L"] },
      { id: "dp-comms", title: "DP PL Comms", start: axis(2026, 10, 5), end: axis(2027, 2, 26), status: "in_progress", owners: ["Equipo C&L"] },
      { id: "isoe", title: "iS&OE / iS&OP Onboarding", start: axis(2026, 11, 30), end: axis(2026, 12, 18), status: "at_risk", owners: ["Equipo C&L", "Negocio UK/PL"] },
      { id: "guided-forums", title: "Guided Forums", start: axis(2027, 1, 18), end: axis(2027, 5, 31), status: "not_started", owners: ["Equipo C&L"] },
    ],
  },
];

export const GATES: Gate[] = [
  { id: "g1", label: "UAT entry", position: axis(2026, 8, 24) },
  { id: "g2", label: "UAT exit", position: axis(2026, 10, 19) },
  { id: "g3", label: "DP PR entry", position: axis(2026, 11, 2) },
  { id: "g4", label: "DP Go Live", position: axis(2026, 11, 16) },
  { id: "g5", label: "Go Live PL", position: axis(2027, 1, 18) },
  { id: "g6", label: "Go Live UK", position: axis(2027, 2, 8) },
  { id: "g7", label: "Hyp exit", position: axis(2027, 5, 17) },
];

// Change Freeze bands removed for now — revisiting as fixed markers instead
// of translucent period bands (see conversation). Band/PoapRenderer support
// for period bands stays in place, just unused until that's decided.
export const BANDS: Band[] = [];

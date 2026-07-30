import type { PhaseStatus } from "@/components/poap-renderer/types";

export type Locale = "es" | "en";
export const LOCALES: Locale[] = ["es", "en"];
export const DEFAULT_LOCALE: Locale = "es";

export const MONTH_ABBR: Record<Locale, string[]> = {
  es: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};

export const STATUS_LABELS: Record<Locale, Record<PhaseStatus, string>> = {
  es: { done: "Completado", in_progress: "En curso", at_risk: "En riesgo", not_started: "No iniciado" },
  en: { done: "Done", in_progress: "In progress", at_risk: "At risk", not_started: "Not started" },
};

export const ZOOM_LABELS: Record<Locale, Record<"anio" | "mes" | "semana" | "dia", string>> = {
  es: { anio: "Año", mes: "Mes", semana: "Semana", dia: "Día" },
  en: { anio: "Year", mes: "Month", semana: "Week", dia: "Day" },
};

/** Single-letter weekday initials, indexed like Date#getUTCDay() (0=Sunday
 * … 6=Saturday) — shown above the day number in the Día zoom's sub row.
 * Spanish uses X for Wednesday (not M) so Tue/Wed/Sat don't collide. */
export const DAY_INITIALS: Record<Locale, string[]> = {
  es: ["D", "L", "M", "X", "J", "V", "S"],
  en: ["S", "M", "T", "W", "T", "F", "S"],
};

/**
 * Shared stage taxonomy for team-level phases — tagging a phase with one of
 * these is what lets a project's portfolio-level summary bars (SIT/UAT/TCO/…)
 * get derived automatically from whatever teams already entered, instead of
 * someone hand-maintaining a second, parallel executive summary. Optional on
 * Phase (see PoapRendererProps/Phase in poap-renderer/types.ts) — untagged
 * phases just don't contribute to any project-level stage bar.
 */
export type StageCategory = "design" | "scope" | "build" | "sit" | "uat" | "tco" | "test" | "rollout" | "other";
export const STAGE_CATEGORIES: StageCategory[] = ["design", "scope", "build", "sit", "uat", "tco", "test", "rollout", "other"];

export const STAGE_CATEGORY_LABELS: Record<Locale, Record<StageCategory, string>> = {
  es: {
    design: "Diseño",
    scope: "Alcance",
    build: "Construcción",
    sit: "SIT",
    uat: "UAT",
    tco: "TCO",
    test: "Pruebas",
    rollout: "Despliegue",
    other: "Otro",
  },
  en: {
    design: "Design",
    scope: "Scope",
    build: "Build",
    sit: "SIT",
    uat: "UAT",
    tco: "TCO",
    test: "Test",
    rollout: "Rollout",
    other: "Other",
  },
};

/**
 * poap-renderer/ only ever receives data in and fires callbacks out (see
 * the component's own architecture comment) — it never reaches into app
 * state or context. Locale is just another prop, same as `months` or
 * `startMonth`, and this is its whole (small) surface of literal UI
 * strings — kept separate from the much larger app-level `translations`
 * dict in src/app/i18n so the renderer never has to import from src/app.
 */
export const RENDERER_STRINGS: Record<
  Locale,
  {
    continuousZoom: string;
    zoomOut: string;
    zoomIn: string;
    zoomLevel: string;
    stageGates: string;
    expandLane: string;
    collapseLane: string;
    weekOfPrefix: string; // "Semana del 12 ago" — prefix only, day/month appended by the caller
    phaseOne: string;
    phaseOther: string;
    summaryLabel: string; // capitalized, leads the aggregate bar's own label: "Resumen — 4 fases"
    summarySuffix: string; // lowercase, trails the lane name in a tooltip title: "Producto — resumen"
    start: string;
    end: string;
    involved: string;
    date: string;
    today: string;
  }
> = {
  es: {
    continuousZoom: "Zoom continuo",
    zoomOut: "Reducir zoom",
    zoomIn: "Aumentar zoom",
    zoomLevel: "Nivel de zoom temporal",
    stageGates: "Stage gates",
    expandLane: "Expandir carril",
    collapseLane: "Colapsar carril",
    weekOfPrefix: "Semana del",
    phaseOne: "fase",
    phaseOther: "fases",
    summaryLabel: "Resumen",
    summarySuffix: "resumen",
    start: "Inicio",
    end: "Fin",
    involved: "Involucrados",
    date: "Fecha",
    today: "Hoy",
  },
  en: {
    continuousZoom: "Continuous zoom",
    zoomOut: "Zoom out",
    zoomIn: "Zoom in",
    zoomLevel: "Time zoom level",
    stageGates: "Stage gates",
    expandLane: "Expand lane",
    collapseLane: "Collapse lane",
    weekOfPrefix: "Week of",
    phaseOne: "phase",
    phaseOther: "phases",
    summaryLabel: "Summary",
    summarySuffix: "summary",
    start: "Start",
    end: "End",
    involved: "Involved",
    date: "Date",
    today: "Today",
  },
};

/** Picks the singular/plural word form for `n` — every count in this app
 * is rendered as "{n} {word}" (e.g. "3 fases"), so this only ever needs to
 * choose the word; the caller supplies the number itself. Neither Spanish
 * nor English needs anything fancier than "1 vs. not 1" for these counts. */
export function pluralForm(n: number, forms: { one: string; other: string }): string {
  return n === 1 ? forms.one : forms.other;
}

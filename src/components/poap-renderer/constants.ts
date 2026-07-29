/** Wide enough for real Spanish team names ("Cambio y Formación") without
 * truncating — full lane names must stay legible, so this isn't the old
 * 88px reference-width value anymore. */
export const LABEL_COL_WIDTH = 176;
export const BAR_HEIGHT = 17;
export const ROW_GAP = 2;
export const LANE_PADDING_Y = 5;
export const BAR_RADIUS = 3;
export const BAR_FONT_SIZE = 11;
export const GATE_COLLISION_PX = 60;
export const GATE_SHIFT_PX = 14;
export const BAR_MIN_TEXT_PX = 40;

export const YEAR_ROW_HEIGHT = 20;
export const MONTH_ROW_HEIGHT = 22;
export const SUB_ROW_HEIGHT = 16;
export const GATES_ROW_BASE_HEIGHT = 22;

export type SubRowGranularity = "none" | "week" | "day";

export interface ZoomLevel {
  key: "anio" | "mes" | "semana" | "dia";
  /** Per-month width floor in px at 100% scale — the actual value used is
   * this times the continuous zoomScale multiplier (see ZOOM_SCALE_*). The
   * date range shown never changes, only how many px each month gets;
   * below the floor the timeline scrolls horizontally instead of
   * compressing further. */
  pxPerMonth: number;
  /** What the third ruler row (and Focus Cell, when that row is clicked)
   * divides the timeline into. "none" at Año — there's nothing finer than
   * a month drawn at that zoom. */
  subRowGranularity: SubRowGranularity;
}

// Display labels ("Año"/"Year", ...) live in src/lib/i18n's ZOOM_LABELS,
// keyed by the same `key` values below — this array only carries the
// locale-independent layout data.
export const ZOOM_LEVELS: ZoomLevel[] = [
  { key: "anio", pxPerMonth: 60, subRowGranularity: "none" },
  { key: "mes", pxPerMonth: 170, subRowGranularity: "week" },
  { key: "semana", pxPerMonth: 430, subRowGranularity: "week" },
  { key: "dia", pxPerMonth: 1000, subRowGranularity: "day" },
];

/** Continuous zoom (the "+ 100% -" stepper), layered on top of whichever
 * ZoomLevel is active — Excel-style gradual resize, distinct from the
 * discrete Año/Mes/Semana/Día levels which also change what the ruler
 * shows, not just how wide things are. */
export const ZOOM_SCALE_MIN = 0.5;
export const ZOOM_SCALE_MAX = 3;
export const ZOOM_SCALE_STEP = 0.25;
export const ZOOM_SCALE_DEFAULT = 1;

/** Wide enough for real Spanish team names ("Cambio y Formación") without
 * truncating even with every row control present (drag handle, "+", name,
 * Gantt/delete stack) — 176 still clipped ordinary names once those
 * controls ate into it. */
export const LABEL_COL_WIDTH = 224;
export const BAR_HEIGHT = 17;
export const ROW_GAP = 2;
// 9, not 5 — the label row now stacks the Gantt/delete buttons vertically
// (see .laneRowActions) instead of side by side, so the minimum row height
// needs enough headroom for two small stacked buttons (16px each + a 2px
// gap = 34px), not just one bar.
export const LANE_PADDING_Y = 9;
export const BAR_RADIUS = 3;
export const BAR_FONT_SIZE = 11;
export const GATE_COLLISION_PX = 60;
export const GATE_SHIFT_PX = 14;
export const BAR_MIN_TEXT_PX = 40;

export const YEAR_ROW_HEIGHT = 20;
export const MONTH_ROW_HEIGHT = 22;
export const SUB_ROW_HEIGHT = 16;
export const GATES_ROW_BASE_HEIGHT = 22;

/** A reserved, otherwise-empty strip above the year row — exists only so
 * the today/selected-column badges have real space to sit in above the
 * ruler, instead of overlapping the year label or any gate/bar content
 * below it. Sticky, same as the ruler, so it stays pinned to the top of
 * the calendar's internal scroll alongside it. */
export const BADGE_STRIP_HEIGHT = 20;

export type SubRowGranularity = "none" | "quarter" | "week" | "day";

export interface ZoomLevel {
  key: "anio" | "mes" | "semana" | "dia";
  /** Per-month width floor in px at 100% scale — the actual value used is
   * this times the continuous zoomScale multiplier (see ZOOM_SCALE_*). The
   * date range shown never changes, only how many px each month gets;
   * below the floor the timeline scrolls horizontally instead of
   * compressing further. */
  pxPerMonth: number;
  /** What the third ruler row (and Focus Cell, when that row is clicked)
   * divides the timeline into. */
  subRowGranularity: SubRowGranularity;
  /** Floor for the continuous zoom stepper at this level — overrides
   * ZOOM_SCALE_MIN when set. Semana's own 430px/month base is dense enough
   * that the shared 0.5 floor (215px/month) still couldn't compress it
   * down to where Mes-level overviews live; every other level keeps the
   * shared floor. */
  minScale?: number;
}

// Display labels ("Año"/"Year", ...) live in src/lib/i18n's ZOOM_LABELS,
// keyed by the same `key` values below — this array only carries the
// locale-independent layout data.
export const ZOOM_LEVELS: ZoomLevel[] = [
  // Año's third row divides each year into calendar quarters (Q1-Q4)
  // instead of showing nothing finer than a month.
  { key: "anio", pxPerMonth: 60, subRowGranularity: "quarter" },
  // Mes shows only year/month — a week sub-row was redundant with Semana's
  // own zoom level right next to it.
  { key: "mes", pxPerMonth: 170, subRowGranularity: "none" },
  { key: "semana", pxPerMonth: 430, subRowGranularity: "week", minScale: 0.2 },
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

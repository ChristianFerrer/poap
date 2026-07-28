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
export const WEEK_ROW_HEIGHT = 16;
export const GATES_ROW_BASE_HEIGHT = 22;

export interface ZoomLevel {
  key: "anio" | "mes" | "semana" | "dia";
  label: string;
  /** Per-month width floor in px — this is what "zoom" actually changes.
   * The date range shown never changes, only how many px each month gets;
   * below this floor the timeline scrolls horizontally instead of
   * compressing further. showWeekRow controls the third ruler tier. */
  pxPerMonth: number;
  showWeekRow: boolean;
}

export const ZOOM_LEVELS: ZoomLevel[] = [
  { key: "anio", label: "Año", pxPerMonth: 60, showWeekRow: false },
  { key: "mes", label: "Mes", pxPerMonth: 170, showWeekRow: true },
  { key: "semana", label: "Semana", pxPerMonth: 430, showWeekRow: true },
  { key: "dia", label: "Día", pxPerMonth: 1000, showWeekRow: true },
];

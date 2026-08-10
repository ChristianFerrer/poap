/** Icon set shared across the whole app, including poap-renderer/ — thin
 * wrappers around lucide-react (per the design-system spec, §5.3) rather
 * than hand-drawn SVG, but keeping the exact same exported component
 * names as before so no call site anywhere had to change. Sized by
 * hierarchy per the spec: 14px inline in buttons/rows, 20px for the
 * sidebar's own navigation icons. Lives in src/lib (not src/app) for the
 * same reason MONTH_ABBR/STATUS_LABELS do: it's pure, stateless,
 * presentational data that poap-renderer is allowed to depend on without
 * breaking its data-in/callback-out contract, unlike anything stateful in
 * src/app. */

import {
  AlertTriangle,
  ArrowUpDown,
  ChartNoAxesGantt,
  Check,
  ChevronLeft,
  ChevronRight,
  Diamond,
  Download,
  Minus,
  MoreVertical,
  Plus,
  Rows3,
  Search,
  Settings as SettingsIcon,
  Trash2,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";

const BUTTON_SIZE = 14; // inline in buttons, rows, form controls
const NAV_SIZE = 20; // the sidebar's own destination icons

// A larger icon at the same stroke width as a small one reads as bolder —
// the stroke-to-size ratio goes up, not just the icon itself — which is
// exactly why the sidebar's 20px destination icons looked heavier than
// everything else even though every icon in the app used the same
// strokeWidth={2}. REST is the one weight every icon renders at by
// default now, regardless of size; ACTIVE is reserved for a genuinely
// selected/current state (see Sidebar's own `active` prop below) — never
// a static per-icon or per-size choice.
const REST_STROKE = 1.75;
const ACTIVE_STROKE = 2.25;

function icon(Lucide: LucideIcon, size: number) {
  return function Icon({ active = false }: { active?: boolean } = {}) {
    return <Lucide size={size} strokeWidth={active ? ACTIVE_STROKE : REST_STROKE} aria-hidden="true" />;
  };
}

export const IconClose = icon(X, BUTTON_SIZE);
export const IconTrash = icon(Trash2, BUTTON_SIZE);
export const IconPlus = icon(Plus, BUTTON_SIZE);
export const IconMinus = icon(Minus, BUTTON_SIZE);
export const IconUpload = icon(Upload, BUTTON_SIZE);
export const IconChevronRight = icon(ChevronRight, BUTTON_SIZE);
export const IconChevronLeft = icon(ChevronLeft, BUTTON_SIZE);
export const IconCheck = icon(Check, BUTTON_SIZE);
export const IconSearch = icon(Search, BUTTON_SIZE);
export const IconSort = icon(ArrowUpDown, BUTTON_SIZE);
export const IconGantt = icon(ChartNoAxesGantt, BUTTON_SIZE);
/* A single column of 3 dots (not GripVertical's 2x3 six-dot grid) — the
   swimline row's own drag handle. */
export const IconGrip = icon(MoreVertical, BUTTON_SIZE);
export const IconWarning = icon(AlertTriangle, BUTTON_SIZE);

export const IconGateDiamond = icon(Diamond, NAV_SIZE);
export const IconLanes = icon(Rows3, NAV_SIZE);
export const IconSettings = icon(SettingsIcon, NAV_SIZE);
// Points *into* the app (importing a plan in), not the "choose a file to
// hand over" Upload glyph IconUpload uses elsewhere — same underlying
// action, but this is the sidebar's own standing menu entry, not a
// file-picker button, so the arrow direction needed to read as "in".
export const IconImportNav = icon(Download, NAV_SIZE);
export const IconAlertTriangle = icon(AlertTriangle, NAV_SIZE);

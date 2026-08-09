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
  ChartGantt,
  Check,
  ChevronDown,
  ChevronRight,
  Diamond,
  Home,
  Minus,
  PanelRight,
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

function icon(Lucide: LucideIcon, size: number) {
  return function Icon() {
    return <Lucide size={size} strokeWidth={2} aria-hidden="true" />;
  };
}

export const IconClose = icon(X, BUTTON_SIZE);
export const IconTrash = icon(Trash2, BUTTON_SIZE);
export const IconPlus = icon(Plus, BUTTON_SIZE);
export const IconMinus = icon(Minus, BUTTON_SIZE);
export const IconUpload = icon(Upload, BUTTON_SIZE);
export const IconChevronRight = icon(ChevronRight, BUTTON_SIZE);
export const IconChevronDown = icon(ChevronDown, BUTTON_SIZE);
export const IconCheck = icon(Check, BUTTON_SIZE);
export const IconSearch = icon(Search, BUTTON_SIZE);
export const IconSort = icon(ArrowUpDown, BUTTON_SIZE);
export const IconGantt = icon(ChartGantt, BUTTON_SIZE);

export const IconHome = icon(Home, NAV_SIZE);
export const IconGateDiamond = icon(Diamond, NAV_SIZE);
export const IconLanes = icon(Rows3, NAV_SIZE);
export const IconPanel = icon(PanelRight, NAV_SIZE);
export const IconSettings = icon(SettingsIcon, NAV_SIZE);
export const IconUploadNav = icon(Upload, NAV_SIZE);
export const IconAlertTriangle = icon(AlertTriangle, NAV_SIZE);

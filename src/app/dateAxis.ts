import { fromAxis, toAxis } from "@/components/poap-renderer/toAxis";

/** Axis position (decimal months from a plan's startMonth) <-> the ISO
 * date strings `<input type="date">` speaks, and a short human label for
 * display. Shared by every panel that lets you type/edit a date against a
 * plan's timeline (ExplorerPanel, AddProjectPanel). */
export function toISODate(position: number, startMonth: string): string {
  return fromAxis(position, startMonth).toISOString().slice(0, 10);
}

export function fromISODate(iso: string, startMonth: string): number {
  const [y, m, day] = iso.split("-").map(Number) as [number, number, number];
  return toAxis(new Date(Date.UTC(y, m - 1, day)), startMonth);
}

export function formatDate(position: number, startMonth: string, monthAbbr: string[]): string {
  const d = fromAxis(position, startMonth);
  return `${d.getUTCDate()} ${monthAbbr[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`;
}

/** "jun 2026 — may 2027" / "Jun 2026 — May 2027" — built from a plan's own
 * startMonth/months rather than hardcoded, so it can't drift out of sync
 * with the data and picks up locale-appropriate month abbreviations.
 * Shared by the Program page and every Project page. */
export function formatMonthRange(startMonth: string, months: number, monthAbbr: string[]): string {
  const [y, m] = startMonth.split("-").map(Number) as [number, number];
  const startIdx = m - 1;
  const endIdx = startIdx + months - 1;
  const endYear = y + Math.floor(endIdx / 12);
  return `${monthAbbr[startIdx % 12]} ${y} — ${monthAbbr[endIdx % 12]} ${endYear}`;
}

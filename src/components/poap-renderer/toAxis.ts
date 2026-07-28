/**
 * Converts a calendar date into a decimal-month position on the renderer's
 * axis, relative to `startMonth` ('YYYY-MM'). 0 = the 1st of startMonth,
 * 1 = the 1st of the following month, 0.5 ≈ mid-month. Phase/Gate/Band
 * objects passed to PoapRenderer carry these numbers, not Date objects —
 * this is the one place calendar math happens.
 */
export function toAxis(date: Date, startMonth: string): number {
  const [startYear, startMonthNum] = startMonth.split("-").map(Number) as [number, number];

  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();

  const monthIndex = (year - startYear) * 12 + (month - (startMonthNum - 1));
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const fractionalDay = (day - 1) / daysInMonth;

  return monthIndex + fractionalDay;
}

/**
 * Inverse of toAxis: turns an axis position back into a calendar date, for
 * display (tooltips, panels). Approximate by design — it rounds to the
 * nearest day, which is all a "14 sep 26" label needs.
 */
export function fromAxis(position: number, startMonth: string): Date {
  const [startYear, startMonthNum] = startMonth.split("-").map(Number) as [number, number];

  const monthOffset = Math.floor(position);
  const fractionalDay = position - monthOffset;

  const absoluteMonth = startMonthNum - 1 + monthOffset;
  const year = startYear + Math.floor(absoluteMonth / 12);
  const month = ((absoluteMonth % 12) + 12) % 12;

  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(Math.round(fractionalDay * daysInMonth) + 1, daysInMonth);

  return new Date(Date.UTC(year, month, day));
}

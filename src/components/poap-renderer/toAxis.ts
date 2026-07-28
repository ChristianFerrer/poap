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

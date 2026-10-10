// Shared by the Reports page and the PDF generator so both treat time the same way.
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const daysIn = (y, m) => new Date(y, m, 0).getDate();
const pad = (n) => String(n).padStart(2, '0');

/** The months a report covers: 1-12 for a calendar year, 'YYYY-MM' for every month of a custom range (gaps included). */
export function monthKeysOf(data) {
  if (!data.range) return MONTHS.map((_, i) => i + 1);
  const keys = [];
  let y = Number(data.range.from.slice(0, 4));
  let m = Number(data.range.from.slice(5, 7));
  const endY = Number(data.range.to.slice(0, 4));
  const endM = Number(data.range.to.slice(5, 7));
  while ((y < endY || (y === endY && m <= endM)) && keys.length < 130) {
    keys.push(`${y}-${pad(m)}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return keys;
}

/**
 * How many days of this month could have been reported: limited by the selected range and by the date
 * the data runs to. Returns null when the month lies entirely after the latest data (it has not happened yet).
 */
export function possibleDays(data, key) {
  const custom = !!data.range;
  const y = custom ? Number(key.slice(0, 4)) : data.year;
  const m = custom ? Number(key.slice(5, 7)) : Number(key);
  const monthStart = `${y}-${pad(m)}-01`;
  const monthEnd = `${y}-${pad(m)}-${pad(daysIn(y, m))}`;
  const lo = custom && data.range.from > monthStart ? data.range.from : monthStart;
  let hi = custom && data.range.to < monthEnd ? data.range.to : monthEnd;
  if (data.as_of && data.as_of < hi) hi = data.as_of;
  if (lo > hi) return null;
  return Math.round((new Date(hi) - new Date(lo)) / 86400000) + 1;
}

export const monthLabel = (key) => (typeof key === 'number' || /^\d+$/.test(String(key))
  ? MONTHS[Number(key) - 1]
  : new Date(`${key}-01T00:00:00`).toLocaleDateString('en', { month: 'short', year: '2-digit' }));

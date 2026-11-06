// Pure date/range logic. Ranges are { start: Date, end: Date }; rows are half-hours from 07:00.

export const FIRST_HOUR = 7;
export const ROWS = 32; // 07:00 to 23:00
export const HALF = 30 * 60 * 1000;

export const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const startOfWeek = (d) => addDays(startOfDay(d), -((d.getDay() + 6) % 7)); // Monday
export const sameDay = (a, b) => startOfDay(a).getTime() === startOfDay(b).getTime();
export const withDates = (r) => ({ ...r, start: new Date(r.start_at), end: new Date(r.end_at) });

/** Row (half-hours since 07:00, fractional) of a moment on its day. */
export const rowIndex = (d) => (d.getHours() - FIRST_HOUR) * 2 + d.getMinutes() / 30 + d.getSeconds() / 1800;

/** Row under a pointer: y pixels from the column top, clamped to 0..ROWS-1. */
export const snapRow = (y, rowHeight) => Math.min(ROWS - 1, Math.max(0, Math.floor(y / rowHeight)));

/** Date at the top edge of a row on a given day (row ROWS = 23:00). */
export function rowToDate(day, row) {
  const x = new Date(day);
  x.setHours(FIRST_HOUR, 0, 0, 0);
  x.setMinutes(row * 30);
  return x;
}

/** Drag from row a to row b (either order) covers whole half-hours. */
export function dragRange(day, a, b) {
  return { start: rowToDate(day, Math.min(a, b)), end: rowToDate(day, Math.max(a, b) + 1) };
}

/** First row of the day that starts after `now` (ROWS when the day is over). */
export const firstFutureRow = (day, now) =>
  Math.min(ROWS, Math.max(0, Math.ceil((now - rowToDate(day, 0)) / HALF)));

/** Next half-hour boundary strictly after `now`. */
export const nextHalfHour = (now) => new Date(Math.floor(now.getTime() / HALF) * HALF + HALF);

export const overlaps = (a, b) => a.start < b.end && b.start < a.end;
export const contains = (outer, inner) => outer.start <= inner.start && inner.end <= outer.end;

/** Position of a range inside one day column ({top, len} in rows), clipped to 07:00-23:00, or null. */
export function dayRows(range, day) {
  const base = rowToDate(day, 0);
  const s = Math.max(range.start, base);
  const e = Math.min(range.end, rowToDate(day, ROWS));
  return e > s ? { top: (s - base) / HALF, len: (e - s) / HALF } : null;
}

/** Remove every cut from every range; pieces are never merged (a booking must fit one block). */
export function subtractRanges(ranges, cuts) {
  return ranges.flatMap((r) => {
    let pieces = [{ start: r.start, end: r.end }];
    for (const c of cuts) {
      pieces = pieces.flatMap((p) => {
        if (!overlaps(p, c)) return [p];
        const out = [];
        if (p.start < c.start) out.push({ start: p.start, end: c.start });
        if (c.end < p.end) out.push({ start: c.end, end: p.end });
        return out;
      });
    }
    return pieces;
  });
}

/** Bookable pieces: availability from the next half-hour on, minus busy ranges. */
export function freeIntervals(avail, busy, now) {
  const from = nextHalfHour(now);
  const clipped = avail
    .map((a) => ({ start: a.start < from ? from : a.start, end: a.end }))
    .filter((a) => a.end > a.start);
  return subtractRanges(clipped, busy);
}

/** Union of `add` with every existing range it overlaps or touches. ids = the existing rows absorbed. */
export function mergeRange(existing, add) {
  let { start, end } = add;
  const ids = new Set();
  for (let changed = true; changed;) {
    changed = false;
    for (const e of existing) {
      if (!ids.has(e.id) && e.start <= end && start <= e.end) {
        ids.add(e.id);
        if (e.start < start) start = e.start;
        if (e.end > end) end = e.end;
        changed = true;
      }
    }
  }
  return { start, end, ids: [...ids] };
}

/** Half-hour moments t with from <= t < to, stepping from `from`. */
export function halfHours(from, to) {
  const out = [];
  for (let t = from.getTime(); t < to.getTime(); t += HALF) out.push(new Date(t));
  return out;
}

// ---------- formatting ----------

const WEEKDAYS = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
const pad = (n) => String(n).padStart(2, '0');
const nf = new Intl.NumberFormat('vi-VN');

export const weekdayName = (d) => WEEKDAYS[d.getDay()];
export const fmtDay = (d) => `${WEEKDAYS[d.getDay()]}, ${d.getDate()}/${d.getMonth() + 1}`;
export const fmtDate = (d) => `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
export const fmtTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const fmtRange = (a, b) => `${fmtTime(a)}–${fmtTime(b)}`;
export const fmtMoney = (n) => `${nf.format(n)} đ`;

export function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${nf.format(Math.round(n / 1024))} KB`;
  return `${nf.format(Math.round((n / 1024 / 1024) * 10) / 10)} MB`;
}

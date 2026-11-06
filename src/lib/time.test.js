import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startOfWeek, addDays, rowIndex, snapRow, rowToDate, dragRange, firstFutureRow, nextHalfHour,
  overlaps, contains, dayRows, subtractRanges, freeIntervals, mergeRange, halfHours,
  byMonth, fmtDay, fmtDate, fmtTime, fmtRange, fmtMoney, fmtBytes, ROWS,
} from './time.js';

const at = (d, h, m = 0) => new Date(2026, 10, d, h, m); // November 2026: the 9th is a Monday
const r = (d, h1, h2) => ({ start: at(d, h1), end: at(d, h2) });

test('startOfWeek is Monday 00:00 for every weekday', () => {
  for (let d = 9; d <= 15; d++) assert.deepEqual(startOfWeek(at(d, 15, 20)), at(9, 0));
  assert.deepEqual(startOfWeek(at(16, 0)), at(16, 0)); // next Monday starts a new week
  assert.deepEqual(addDays(at(30, 0), 1), new Date(2026, 11, 1));
});

test('rowIndex counts half-hours from 07:00', () => {
  assert.equal(rowIndex(at(9, 7)), 0);
  assert.equal(rowIndex(at(9, 18, 30)), 23);
  assert.equal(rowIndex(at(9, 22, 45)), 31.5);
});

test('snapRow clamps and floors, rowToDate / dragRange round-trip', () => {
  assert.equal(snapRow(-5, 22), 0);
  assert.equal(snapRow(43, 22), 1);
  assert.equal(snapRow(44, 22), 2);
  assert.equal(snapRow(9999, 22), ROWS - 1);
  assert.deepEqual(rowToDate(at(9, 12), 0), at(9, 7));
  assert.deepEqual(rowToDate(at(9, 12), ROWS), at(9, 23));
  assert.deepEqual(dragRange(at(9, 0), 5, 2), { start: at(9, 8), end: at(9, 10) });
  assert.deepEqual(dragRange(at(9, 0), 3, 3), { start: at(9, 8, 30), end: at(9, 9) });
});

test('firstFutureRow and nextHalfHour', () => {
  const day = at(9, 0);
  assert.equal(firstFutureRow(day, at(9, 6)), 0);
  assert.equal(firstFutureRow(day, at(9, 8, 10)), 3); // 08:30 is the first row still ahead
  assert.equal(firstFutureRow(day, at(9, 23, 30)), ROWS);
  assert.equal(firstFutureRow(at(10, 0), at(9, 12)), 0); // a future day: nothing is past
  assert.equal(firstFutureRow(day, at(10, 1)), ROWS); // a past day: everything is
  assert.deepEqual(nextHalfHour(at(9, 8, 0)), at(9, 8, 30));
  assert.deepEqual(nextHalfHour(at(9, 8, 29)), at(9, 8, 30));
});

test('overlaps and contains treat touching ranges as separate', () => {
  assert.equal(overlaps(r(9, 8, 10), r(9, 10, 12)), false);
  assert.equal(overlaps(r(9, 8, 11), r(9, 10, 12)), true);
  assert.equal(contains(r(9, 8, 12), r(9, 9, 10)), true);
  assert.equal(contains(r(9, 8, 12), r(9, 11, 13)), false);
  assert.equal(contains(r(9, 8, 12), r(9, 8, 12)), true);
});

test('dayRows places and clips a range inside the 07:00-23:00 column', () => {
  assert.deepEqual(dayRows(r(9, 18, 20), at(9, 0)), { top: 22, len: 4 });
  assert.deepEqual(dayRows({ start: at(9, 5), end: at(9, 8) }, at(9, 0)), { top: 0, len: 2 });
  assert.equal(dayRows(r(9, 18, 20), at(10, 0)), null);
  assert.equal(dayRows({ start: at(9, 23), end: at(9, 23, 30) }, at(9, 0)), null);
});

test('subtractRanges splits around cuts and keeps adjacent pieces apart', () => {
  assert.deepEqual(subtractRanges([r(9, 8, 12)], [r(9, 9, 10)]), [r(9, 8, 9), r(9, 10, 12)]);
  assert.deepEqual(subtractRanges([r(9, 8, 12)], [r(9, 7, 9), r(9, 11, 13)]), [r(9, 9, 11)]);
  assert.deepEqual(subtractRanges([r(9, 8, 9), r(9, 9, 10)], []), [r(9, 8, 9), r(9, 9, 10)]);
  assert.deepEqual(subtractRanges([r(9, 8, 10)], [r(9, 7, 11)]), []);
});

test('freeIntervals clips the past and removes busy time', () => {
  const now = at(9, 9, 10);
  const free = freeIntervals([r(9, 8, 12)], [r(9, 10, 11)], now);
  assert.deepEqual(free, [{ start: at(9, 9, 30), end: at(9, 10) }, r(9, 11, 12)]);
  assert.deepEqual(freeIntervals([r(9, 8, 9)], [], now), []);
});

test('mergeRange joins overlapping and touching blocks, chains included', () => {
  const ex = [{ id: 1, ...r(9, 8, 10) }, { id: 2, ...r(9, 11, 12) }, { id: 3, ...r(9, 14, 15) }];
  const m = mergeRange(ex, r(9, 10, 11));
  assert.deepEqual([m.start, m.end], [at(9, 8), at(9, 12)]);
  assert.deepEqual(m.ids.sort(), [1, 2]);
  const lone = mergeRange(ex, r(9, 16, 17));
  assert.deepEqual(lone.ids, []);
});

test('halfHours lists steps', () => {
  assert.deepEqual(halfHours(at(9, 8), at(9, 9, 30)), [at(9, 8), at(9, 8, 30), at(9, 9)]);
});

test('byMonth groups by calendar month, oldest first, due on the last day', () => {
  const b = (start, price) => ({ start, price });
  const now = at(15, 10);
  const g = byMonth([b(at(20, 9), 300), b(new Date(2026, 9, 31, 23, 30), 100), b(at(2, 9), 100), b(new Date(2026, 1, 10, 9), 50)], now);
  assert.deepEqual(g.map((x) => x.key), ['2026-02', '2026-10', '2026-11']);
  assert.equal(g[2].label, 'Tháng 11/2026');
  assert.deepEqual(g[2].items.map((x) => x.price), [100, 300]); // sorted by start
  assert.deepEqual(g.map((x) => x.total), [50, 100, 400]);
  assert.deepEqual(g.map((x) => x.overdue), [true, true, false]);
  assert.deepEqual(g[2].start, at(1, 0));
  assert.deepEqual(g[2].next, new Date(2026, 11, 1));
  assert.equal(fmtDate(g[2].due), '30/11/2026');
  assert.equal(fmtDate(g[0].due), '28/2/2026');
  assert.equal(fmtDate(byMonth([b(new Date(2028, 1, 3), 1)], now)[0].due), '29/2/2028');
  assert.equal(byMonth([b(at(5, 9), 1)], new Date(2026, 11, 1))[0].overdue, true); // overdue from the 1st at 00:00
});

test('formatting', () => {
  assert.equal(fmtDay(at(9, 0)), 'Thứ Hai, 9/11');
  assert.equal(fmtDay(at(15, 0)), 'Chủ Nhật, 15/11');
  assert.equal(fmtTime(at(9, 8, 5)), '08:05');
  assert.equal(fmtRange(at(9, 18), at(9, 19, 30)), '18:00–19:30');
  assert.equal(fmtMoney(100000), '100.000 đ');
  assert.equal(fmtMoney(0), '0 đ');
  assert.equal(fmtBytes(500), '500 B');
  assert.equal(fmtBytes(2048), '2 KB');
  assert.match(fmtBytes(5 * 1024 * 1024), /^5 MB$/);
});

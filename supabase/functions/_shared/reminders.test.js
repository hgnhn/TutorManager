import test from 'node:test'
import assert from 'node:assert/strict'
import { dueReminders } from './reminders.js'

const people = { s1: { name: 'An', email: 'an@x.vn' }, s2: { name: 'Bình', email: null } }
const lesson = (id, start, student = 's1') => ({ id, student_id: student, start_at: start, end_at: new Date(Date.parse(start) + 90 * 60e3).toISOString() })
const keys = (r) => r.map((m) => m.key)
const run = (now, up = [], un = [], p = people) => dueReminders(new Date(now), up, un, p)

test('eve reminder only from 20:00 VN the day before', () => {
  const l = lesson(1, '2026-11-08T07:00:00Z') // Nov 8 14:00 VN
  const r = run('2026-11-07T13:00:00Z', [l])
  assert.deepEqual(keys(r), ['lesson-eve:1'])
  assert.equal(r[0].subject, 'Nhắc lịch học ngày mai lúc 14:00')
  assert.match(r[0].text, /Chủ Nhật, 8\/11, 14:00–15:30/)
  assert.deepEqual(run('2026-11-07T12:59:00Z', [l]), [])
})

test('no eve reminder when the lesson is within 1 h', () => {
  const now = '2026-11-07T16:45:00Z' // 23:45 VN
  assert.deepEqual(keys(run(now, [lesson(2, '2026-11-07T17:30:00Z')])), ['lesson-1h:2']) // 45 min away
  assert.deepEqual(keys(run(now, [lesson(5, '2026-11-07T18:00:00Z')])), ['lesson-eve:5']) // 75 min away
})

test('1 h reminder inside the window only', () => {
  const l = lesson(3, '2026-11-08T07:00:00Z')
  const r = run('2026-11-08T06:00:00Z', [l])
  assert.deepEqual(keys(r), ['lesson-1h:3'])
  assert.equal(r[0].subject, 'Buổi học bắt đầu lúc 14:00')
  assert.deepEqual(run('2026-11-08T05:59:00Z', [l]), [])
  assert.deepEqual(run('2026-11-08T07:00:00Z', [l]), [])
})

test('fee-due from day last-3 at 08:00 VN', () => {
  const un = [{ id: 1, student_id: 's1', start_at: '2026-11-10T07:00:00Z', price: 200000 }, { id: 2, student_id: 's1', start_at: '2026-11-12T07:00:00Z', price: 300000 }]
  const r = run('2026-11-27T01:00:00Z', [], un) // Nov 27 08:00 VN
  assert.deepEqual(keys(r), ['fee-due:s1:2026-11'])
  assert.equal(r[0].subject, 'Học phí tháng 11/2026: 500.000 đ, hạn 30/11/2026')
  assert.deepEqual(run('2026-11-27T00:59:00Z', [], un), [])
  assert.deepEqual(run('2026-11-26T01:00:00Z', [], un), [])
})

test('VN month boundary: 2026-11-30T18:00Z belongs to December', () => {
  const un = [{ id: 1, student_id: 's1', start_at: '2026-11-30T18:00:00Z', price: 100000 }]
  assert.deepEqual(keys(run('2026-12-28T02:00:00Z', [], un)), ['fee-due:s1:2026-12'])
  assert.deepEqual(run('2026-12-01T02:00:00Z', [], un), []) // Dec 1, not overdue
})

test('fee-late for a lesson in a previous month, once per month key', () => {
  const un = [{ id: 1, student_id: 's1', start_at: '2026-10-20T07:00:00Z', price: 150000 }]
  const r = run('2026-11-01T01:00:00Z', [], un)
  assert.deepEqual(keys(r), ['fee-late:s1:2026-11'])
  assert.equal(r[0].subject, 'Học phí quá hạn: 150.000 đ')
  assert.deepEqual(run('2026-10-31T17:00:00Z', [], un), []) // Nov 1 00:00 VN, before 08:00
})

test('nobody without an email', () => {
  const l = lesson(4, '2026-11-08T07:00:00Z', 's2')
  const un = [{ id: 1, student_id: 's2', start_at: '2026-10-20T07:00:00Z', price: 1 }, { id: 2, student_id: 'ghost', start_at: '2026-10-20T07:00:00Z', price: 1 }]
  assert.deepEqual(run('2026-11-07T13:00:00Z', [l], un), [])
})

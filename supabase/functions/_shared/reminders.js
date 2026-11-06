// Pure reminder rules (plain JS so Deno and Node can both import it). All calendar math is Vietnam time, UTC+7, no DST.
const WEEKDAYS = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']
const H = 3600e3
const pad = (n) => String(n).padStart(2, '0')
const money = (n) => new Intl.NumberFormat('vi-VN').format(n) + ' đ'

function vn(t) {
  const v = new Date(t + 7 * H)
  return {
    y: v.getUTCFullYear(), m: v.getUTCMonth() + 1, d: v.getUTCDate(), h: v.getUTCHours(),
    min: v.getUTCMinutes(), wd: v.getUTCDay(), day: Math.floor((t + 7 * H) / 24 / H),
  }
}
const hhmm = (t) => { const v = vn(t); return `${pad(v.h)}:${pad(v.min)}` }
const monthIdx = (v) => v.y * 12 + v.m - 1

export function dueReminders(now, upcoming, unpaid, people, site = 'https://hgnhn.github.io/TutorManager/') {
  const out = []
  const n = now.getTime()
  const cur = vn(n)
  const hello = (p) => `Chào ${p.name || 'bạn'},\n\n`
  const bye = '\n\nTutorManager'

  for (const b of upcoming) {
    const p = people[b.student_id]
    if (!p?.email) continue
    const s = Date.parse(b.start_at), e = Date.parse(b.end_at)
    const diff = s - n
    const sv = vn(s)
    const when = `${WEEKDAYS[sv.wd]}, ${sv.d}/${sv.m}, ${hhmm(s)}–${hhmm(e)}`
    const meet = `Link Google Meet hiện ở mục Buổi học 15 phút trước giờ học: ${site}#/buoi-hoc`
    if (cur.h >= 20 && sv.day === cur.day + 1 && diff > H) {
      out.push({ key: `lesson-eve:${b.id}`, to: p.email, subject: `Nhắc lịch học ngày mai lúc ${hhmm(s)}`,
        text: `${hello(p)}Bạn có buổi học vào ${when}.\n${meet}${bye}` })
    }
    if (diff > 0 && diff <= H) {
      out.push({ key: `lesson-1h:${b.id}`, to: p.email, subject: `Buổi học bắt đầu lúc ${hhmm(s)}`,
        text: `${hello(p)}Buổi học của bạn bắt đầu lúc ${hhmm(s)} (${when}).\n${meet}${bye}` })
    }
  }

  if (cur.h >= 8) {
    const last = new Date(Date.UTC(cur.y, cur.m, 0)).getUTCDate()
    const dueSoon = cur.d >= last - 3
    const by = {}
    for (const b of unpaid) (by[b.student_id] ??= []).push(b)
    for (const [id, list] of Object.entries(by)) {
      const p = people[id]
      if (!p?.email) continue
      const sum = (l) => l.reduce((t, b) => t + (b.price || 0), 0)
      const inMonth = list.filter((b) => monthIdx(vn(Date.parse(b.start_at))) === monthIdx(cur))
      const late = list.filter((b) => monthIdx(vn(Date.parse(b.start_at))) < monthIdx(cur))
      const ym = `${cur.y}-${pad(cur.m)}`
      const pay = `Mã chuyển khoản VietQR xem tại: ${site}#/hoc-phi`
      if (dueSoon && inMonth.length) {
        const due = `${last}/${cur.m}/${cur.y}`
        out.push({ key: `fee-due:${id}:${ym}`, to: p.email,
          subject: `Học phí tháng ${cur.m}/${cur.y}: ${money(sum(inMonth))}, hạn ${due}`,
          text: `${hello(p)}Học phí tháng ${cur.m}/${cur.y}: ${inMonth.length} buổi học chưa thanh toán, tổng ${money(sum(inMonth))}. Hạn thanh toán: ${due}.\n${pay}${bye}` })
      }
      if (late.length) {
        out.push({ key: `fee-late:${id}:${ym}`, to: p.email, subject: `Học phí quá hạn: ${money(sum(late))}`,
          text: `${hello(p)}Bạn còn ${late.length} buổi học chưa thanh toán từ các tháng trước, tổng ${money(sum(late))}, đã quá hạn. Bạn vui lòng thanh toán sớm nhé.\n${pay}${bye}` })
      }
    }
  }
  return out
}

import { admin, cors, emails, json, sendOnce, SITE } from '../_shared/mail.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const db = admin()
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: auth } = await db.auth.getUser(token)
    if (!auth?.user) return json({ error: 'Chưa đăng nhập.' }, 401)
    const { data: me } = await db.from('profiles').select('role').eq('id', auth.user.id).maybeSingle()
    if (me?.role !== 'tutor') return json({ error: 'Chỉ gia sư được gửi thông báo.' }, 403)

    const { id } = await req.json()
    const { data: a } = await db.from('announcements').select('id, title, body, student_id').eq('id', id).maybeSingle()
    if (!a) return json({ error: 'Không tìm thấy thông báo.' }, 404)

    let q = db.from('profiles').select('id, full_name').eq('role', 'student')
    if (a.student_id) q = q.eq('id', a.student_id)
    const { data: students, error } = await q
    if (error) throw error
    const addr = await emails(db)
    const mails = (students ?? []).filter((s) => addr[s.id]).map((s) => ({
      key: `announce:${a.id}:${s.id}`,
      to: addr[s.id],
      subject: `Thông báo: ${a.title}`,
      text: `Chào ${s.full_name || 'bạn'},\n\n${a.body}\n\nXem trên TutorManager: ${SITE}#/thong-bao`,
    }))
    return json({ sent: await sendOnce(db, mails) })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

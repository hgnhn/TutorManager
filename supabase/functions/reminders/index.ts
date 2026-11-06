import { admin, emails, json, sendOnce, SITE } from '../_shared/mail.ts'
import { dueReminders } from '../_shared/reminders.js'

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET')
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'Unauthorized' }, 401)
  try {
    const db = admin()
    const now = new Date()
    const soon = new Date(now.getTime() + 36 * 3600e3).toISOString()
    const [up, un] = await Promise.all([
      db.from('bookings').select('id, student_id, start_at, end_at')
        .eq('status', 'approved').gt('start_at', now.toISOString()).lte('start_at', soon),
      db.from('bookings').select('id, student_id, start_at, price')
        .eq('status', 'approved').eq('billable', true).eq('paid', false).lte('start_at', now.toISOString()),
    ])
    if (up.error) throw up.error
    if (un.error) throw un.error

    const ids = [...new Set([...up.data, ...un.data].map((b) => b.student_id))]
    if (!ids.length) return json({ sent: 0 })
    const { data: profs, error } = await db.from('profiles').select('id, full_name').in('id', ids)
    if (error) throw error
    const addr = await emails(db)
    const people = Object.fromEntries((profs ?? []).map((p) => [p.id, { name: p.full_name, email: addr[p.id] }]))

    return json({ sent: await sendOnce(db, dueReminders(now, up.data, un.data, people, SITE)) })
  } catch (e) {
    console.error(e)
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

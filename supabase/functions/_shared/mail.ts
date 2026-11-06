import { createClient } from 'npm:@supabase/supabase-js@2'

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

export const SITE = Deno.env.get('SITE_URL') ?? 'https://hgnhn.github.io/TutorManager/'

export function admin() {
  const key = Object.values(JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}'))[0] as string | undefined
    ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  return createClient(Deno.env.get('SUPABASE_URL')!, key, { auth: { persistSession: false } })
}

// userId -> email
export async function emails(db: ReturnType<typeof admin>): Promise<Record<string, string>> {
  const { data, error } = await db.auth.admin.listUsers({ perPage: 1000 })
  if (error) throw error
  return Object.fromEntries(data.users.filter((u) => u.email).map((u) => [u.id, u.email!]))
}

type Mail = { key: string; to: string; subject: string; text: string }

// Claims each key in email_log first (so two overlapping runs never double-send), then sends only the newly claimed ones.
export async function sendOnce(db: ReturnType<typeof admin>, mails: Mail[]): Promise<number> {
  if (!mails.length) return 0
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('MAIL_FROM')
  if (!apiKey || !from) throw new Error('Chưa cấu hình RESEND_API_KEY hoặc MAIL_FROM cho Edge Function.')

  const { data, error } = await db.from('email_log')
    .upsert(mails.map((m) => ({ key: m.key })), { onConflict: 'key', ignoreDuplicates: true }).select('key')
  if (error) throw error
  const claimed = new Set((data ?? []).map((r: { key: string }) => r.key))
  const todo = mails.filter((m) => claimed.has(m.key))

  for (let i = 0; i < todo.length; i += 100) {
    const chunk = todo.slice(i, i + 100)
    const res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(chunk.map((m) => ({ from, to: [m.to], subject: m.subject, text: m.text }))),
    })
    if (!res.ok) {
      const detail = await res.text()
      // Release this and later chunks so the next run retries them.
      await db.from('email_log').delete().in('key', todo.slice(i).map((m) => m.key))
      throw new Error(`Resend lỗi ${res.status}: ${detail}`)
    }
  }
  return todo.length
}

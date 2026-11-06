# TODO

## Next session (handoff 2026-11-07, after commit 41fe221)

**Goal:** test a full booking on the real Supabase with a student account, then point bananalab.id.vn at GitHub Pages.
The user writes in Vietnamese; answer in Vietnamese.

**State:** live at https://hgnhn.github.io/TutorManager/ (Pages via Actions, repo Variables set), Supabase project
`rdnrojtblfmrjhbqlzrk` (URL + `sb_publishable_…` key in git-ignored `.env.local`). Local clone: `C:\Users\PC\New folder`,
`.claude/launch.json` runs `npm run dev` on 5173. Last feature commit 41fe221 (paid tick, announcements + bell, email).

**Real DB:** init + announcements_email migrations applied; tutor = lesterdania3@gmail.com (Hoàng Việt Nhân), Cài đặt
filled (BIDV, 100.000 đ); one student "Minh Đức" (ducd67181@gmail.com). Account holder name had a typo
"HOANG V IET NHAN" and the default Meet link was empty: ask if fixed.

**Email is LIVE (verified 2026-11-07):** Resend domain bananalab.id.vn Verified (DKIM/SPF + `_dmarc` `p=none` in
Cloudflare), secrets RESEND_API_KEY / MAIL_FROM / CRON_SECRET set, functions `announce` + `reminders` deployed,
pg_cron job `tutormanager-reminders` (jobid 2, every 15 min) returns 200. Test announcement to Minh Đức: Delivered.
Not yet seen live: a lesson reminder (20:00 eve / 1 h before) or a fee reminder (3 days before month end / the 1st).
Check with read-only queries: `npx supabase db query --remote=rdnrojtblfmrjhbqlzrk --read-only "select key, sent_at
from public.email_log order by sent_at desc"` (also `cron.job_run_details`, `net._http_response`).

**Not confirmed yet (ask the user):**
- `supabase/migrations/20261107000000_material_links.sql` run in SQL Editor (link materials fail until it is).
- "Allow new users to sign up" turned off in Supabase (check: `GET /auth/v1/settings` with the apikey → `disable_signup: true`).
- Site URL in Authentication > URL Configuration.
- The RESEND_API_KEY secret is a NEW key (the user once pasted a key in chat; it must be deleted in Resend).

**Next steps**
1. Tutor paints free time ~30 min ahead; Minh Đức books; tutor approves. Check: Meet link 15 min before, Học phí per
   month, VietQR amount, a file upload/download (bucket `materials` untested on the real project) and a link material,
   the 1 h reminder email.
2. Domain: DNS is on **Cloudflare** (not Long Vân; README §4 is stale). Root A currently 103.2.225.208 (proxied), not
   GitHub. Add GitHub Pages A records + `www` CNAME as **DNS only**, Pages custom domain `bananalab.id.vn`, Enforce
   HTTPS; keep the Zoho MX/SPF and Resend `send`/`resend._domainkey`/`_dmarc` records. Rewrite README §4 for Cloudflare.

**Email code map:** Fees.jsx `StudentLessons` paid tick; `src/pages/Announcements.jsx` (tutor composes, invokes
`announce`); `src/components/Bell.jsx` (students; unread = created_at > localStorage `ann-seen:<uid>`);
`supabase/functions/{announce,reminders}`, `_shared/mail.ts` (`sendOnce` claims `email_log` keys, Resend batch, releases
on failure), `_shared/reminders.js` (pure rules, `npm test`); `supabase/cron.sql` (user pastes with the real secret).

**Files:** schema/RLS `supabase/migrations/` (init + material_links); `src/pages/` (Calendar.jsx big, Fees.jsx monthly
groups via `byMonth` in `src/lib/time.js`, Materials.jsx file/link, Login.jsx sign-in only); `src/lib/vietqr.js`.

**Decided:** Supabase (auth, RLS, storage) + static Vite/React on Pages; email+password, tutor issues accounts (no
self sign-up); in-app bell + email via Resend (no SMS/Zalo); owed = approved, billable, unpaid, started; grouped by calendar month, due
last day, overdue after; QR = total owed. Links must be `https://` (DB check). Code is written by the `sonnet-coder`
subagent, Opus reviews.

**Ruled out / parked:** Docker/local Supabase (RAM); Long Vân website builder; SePay/Casso auto payment check (user:
not now; if revived, SePay supports BIDV, needs an Edge Function webhook and a unique per-student transfer code since
`HOCPHI <NAME>` can collide).

**Traps**
- `npm run test:db` = PGlite with stubbed auth/storage (44 checks); not identical to real Supabase.
- Unauthenticated GitHub API = 60 req/h (a polling loop burned it); read the Actions page in the browser pane instead.
  A deploy takes ~4 min. `gh` CLI is not installed.
- No UI to rename a student (SQL only). Announcement "read" state is per browser (localStorage).
- Known gaps: tutor cannot cancel an approved lesson in the UI; students can send duplicate pending requests;
  phone users book by tapping (no drag).

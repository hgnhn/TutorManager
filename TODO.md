# TODO

## Next session (handoff 2026-11-07)

**Goal:** test a full booking on the real Supabase with a student account, then the domain bananalab.id.vn.
The user writes in Vietnamese; answer in Vietnamese.

**State:** live at https://hgnhn.github.io/TutorManager/ (Pages via Actions, repo Variables set), Supabase project
`rdnrojtblfmrjhbqlzrk` (URL + `sb_publishable_…` key in git-ignored `.env.local`). Local clone: `C:\Users\PC\New folder`,
`.claude/launch.json` runs `npm run dev` on 5173. Commits this session: d13895c (name TutorManager, link materials),
0a8a649 (tuition per month), then accounts-only login (this commit).

**Real DB:** init migration applied; tutor = lesterdania3@gmail.com (Hoàng Việt Nhân), Cài đặt filled (BIDV,
100.000 đ). Account holder name had a typo "HOANG V IET NHAN" and default Meet link was empty: ask if fixed.

**Not confirmed yet (ask the user):**
- `supabase/migrations/20261107000000_material_links.sql` run in SQL Editor (link materials fail until it is).
- "Allow new users to sign up" turned off in Supabase (check: `GET /auth/v1/settings` with the apikey → `disable_signup: true`).
- Site URL in Authentication > URL Configuration.

**Next steps**
1. User creates a student in Supabase (Authentication > Users > Add user, Auto Confirm) + name SQL (README §2
   "Cấp tài khoản cho học viên"). Tutor paints free time ~30 min ahead; student books; tutor approves.
2. Check: Meet link appears 15 min before, Học phí per month (Hạn / Quá hạn, "Đã thu tháng này"), VietQR amount,
   upload/download a file (bucket `materials` never exercised on the real project yet) and a link material.
3. When Long Vân domain leaves "Đang xử lý": Pages custom domain `bananalab.id.vn`, DNS (README §4), Enforce HTTPS.

**Files:** schema/RLS `supabase/migrations/` (init + material_links); `src/pages/` (Calendar.jsx big, Fees.jsx monthly
groups via `byMonth` in `src/lib/time.js`, Materials.jsx file/link, Login.jsx sign-in only); `src/lib/vietqr.js`.

**Decided:** Supabase (auth, RLS, storage) + static Vite/React on Pages; email+password, tutor issues accounts (no
self sign-up); in-app notifications only; owed = approved, billable, unpaid, started; grouped by calendar month, due
last day, overdue after; QR = total owed. Links must be `https://` (DB check). Code is written by the `sonnet-coder`
subagent, Opus reviews.

**Ruled out / parked:** Docker/local Supabase (RAM); Long Vân website builder; SePay/Casso auto payment check (user:
not now; if revived, SePay supports BIDV, needs an Edge Function webhook and a unique per-student transfer code since
`HOCPHI <NAME>` can collide).

**Traps**
- `npm run test:db` = PGlite with stubbed auth/storage (35 checks); not identical to real Supabase.
- Unauthenticated GitHub API = 60 req/h (a polling loop burned it); read the Actions page in the browser pane instead.
  A deploy takes ~4 min. `gh` CLI is not installed.
- No UI to undo "paid"; no UI to rename a student (SQL only).
- Known gaps: tutor cannot cancel an approved lesson in the UI; students can send duplicate pending requests;
  phone users book by tapping (no drag).

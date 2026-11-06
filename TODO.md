# TODO

## Next session (handoff 2026-11-06)

**Goal:** get bananalab live: GitHub Pages + real Supabase + domain bananalab.id.vn, then test a full booking with real accounts.

**State:** code complete and pushed to https://github.com/hgnhn/TutorManager (main at a74bc01 + this file).
Clone it into a real folder first (the first session ran in a temporary app folder that is deleted with it).

**Done by the user:** Supabase project created ("hgnhn's Project"), "Confirm email" turned off.
**Not confirmed yet:** migration SQL run in SQL Editor; Site URL set; GitHub Pages source = GitHub Actions;
repo Variables `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (use the `sb_publishable_…` key, never `sb_secret_…`).

**Next steps**
1. Get Project URL + publishable key from the user, put them in `.env.local`, `npm run dev`, user signs up,
   run the "make tutor" SQL from README section 2 with the user's email.
2. Tutor sets Cài đặt (price, bank BIN, account, name, default Meet link). Student test account books, tutor approves,
   check Meet link appears 15 min before, fees + VietQR, upload/download a material (bucket `materials`).
3. Check the first Actions deploy (it fails until Pages is enabled; re-run after setting Variables).
   Site works at https://hgnhn.github.io/TutorManager/ (vite `base: './'`, hash routing).
4. When Long Vân domain leaves "Đang xử lý": Pages custom domain `bananalab.id.vn`, DNS A records ×4 + CNAME www (README §4), Enforce HTTPS.

**Files:** schema/RLS `supabase/migrations/20261106000000_init.sql`; design tokens + notebook calendar CSS
`src/styles/tokens.css`; pages in `src/pages/` (Calendar.jsx is the big one); `src/lib/time.js`, `vietqr.js`.

**Decided:** Supabase (auth, RLS, storage) + static Vite/React on Pages; email+password login; in-app notifications only
(no email/Zalo); owed fees = approved, billable, unpaid, already started; Meet link gated by RLS (−15 min → end).
Design: Vietnamese ruled-notebook concept (vở ô li), banana highlighter = free time, violet ink = lessons.

**Ruled out:** Docker/local Supabase (uses too much RAM on this PC); Long Vân website builder (templates only).

**Traps**
- `npm run test:db` = PGlite with stubbed auth/storage (31 checks); not identical to real Supabase, verify on the real project.
- Supabase free tier sends ~2 auth emails/hour: keep Confirm email off.
- Known gaps: tutor cannot cancel an approved lesson in the UI; students can send duplicate pending requests;
  phone users book by tapping (no drag).

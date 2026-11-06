// Runs the real migration on PGlite with stubbed Supabase auth/storage, then checks RLS as each role.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const migration = readFileSync(process.argv[2], "utf8");
const db = new PGlite();

await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth; create schema storage;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table storage.buckets (id text primary key, name text, public bool, file_size_limit bigint);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  grant usage on schema public, auth, storage to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant select, insert, delete on storage.objects to authenticated;
  -- mimic Supabase's default grants on public
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
`);
await db.exec(migration);

const T = "00000000-0000-0000-0000-00000000000a"; // tutor
const A = "00000000-0000-0000-0000-00000000000b"; // student A
const B = "00000000-0000-0000-0000-00000000000c"; // student B
for (const [id, name] of [[T, "Cô Nhân"], [A, "Lê Văn An"], [B, "Trần Bình"]])
  await db.query(`insert into auth.users values ($1, $2, $3)`, [id, name + "@x.vn", { full_name: name }]);
await db.exec(`update public.profiles set role = 'tutor' where id = '${T}'`);

// run sql as a given user (null = anon); returns rows or throws
async function as(uid, sql, params = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ""}', false); set role ${uid ? "authenticated" : "anon"};`);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("reset role"); }
}
const fails = async (p, re) => assert.rejects(p, re);
let n = 0; const ok = (m) => console.log(`ok ${++n} ${m}`);

// profiles
assert.equal((await as(A, `select role, full_name from profiles`)).length, 1);
assert.equal((await as(A, `select full_name from profiles`))[0].full_name, "Lê Văn An"); ok("signup creates student profile with name");
await fails(as(A, `update profiles set role = 'tutor' where id = '${A}'`), /permission denied/); ok("student cannot promote self");
await as(A, `update profiles set full_name = 'An Lê' where id = '${A}'`); ok("student can rename self");
assert.equal((await as(T, `select * from profiles`)).length, 3); ok("tutor sees all profiles");

// settings / private
await as(A, `update settings set price_per_session = 1`);
assert.equal((await as(T, `select price_per_session from settings`))[0].price_per_session, 100000); ok("student cannot change price");
assert.equal((await as(A, `select * from tutor_private`)).length, 0); ok("student cannot read default meet link");
assert.equal((await as(null, `select * from settings`)).length, 0); ok("anon cannot read bank settings");
await as(T, `update tutor_private set default_meet_link = 'https://meet.google.com/abc'`);

// availability: tomorrow 18:00-21:00 and in 2 days 08:00-10:00
const day = (d, h) => `(date_trunc('day', now()) + interval '${d} day' + interval '${h} hour')`;
await fails(as(A, `insert into availability (start_at, end_at) values (${day(1, 18)}, ${day(1, 21)})`), /row-level security/); ok("student cannot add availability");
await as(T, `insert into availability (start_at, end_at) values (${day(1, 18)}, ${day(1, 21)}), (${day(2, 8)}, ${day(2, 10)})`);
assert.equal((await as(null, `select * from availability`)).length, 2); ok("anon reads availability");

// bookings
const [b1] = await as(A, `insert into bookings (start_at, end_at, status, paid, price, note) values (${day(1, 18)}, ${day(1, 19.5)}, 'approved', true, 1, 'hi') returning *`);
assert.equal(b1.status, "pending"); assert.equal(b1.paid, false); assert.equal(b1.price, 100000); assert.equal(b1.student_id, A); ok("student request forced to pending with default price");
await fails(as(A, `insert into bookings (start_at, end_at) values (${day(1, 20)}, ${day(1, 22)})`), /không nằm trong lịch rảnh/); ok("request outside free time rejected");
const [spoof] = await as(A, `insert into bookings (student_id, start_at, end_at) values ('${B}', ${day(2, 8)}, ${day(2, 9)}) returning student_id`);
assert.equal(spoof.student_id, A); ok("student cannot book for someone else");
await as(T, `delete from bookings where start_at = ${day(2, 8)}`);
assert.equal((await as(A, `update bookings set status = 'approved' returning id`)).length, 0); ok("student cannot approve own booking");
assert.equal((await as(B, `select * from bookings`)).length, 0); ok("student B cannot see A's bookings");

const [b2] = await as(B, `insert into bookings (start_at, end_at) values (${day(1, 19)}, ${day(1, 20)}) returning id`); ok("two pending requests may overlap");
await as(T, `update bookings set status = 'approved' where id = ${b1.id}`);
await as(T, `insert into meet_links values (${b1.id}, 'https://meet.google.com/abc')`);
assert.equal((await as(A, `select * from meet_links`)).length, 0); ok("meet link hidden until 15 min before start");
await fails(as(B, `insert into bookings (start_at, end_at) values (${day(1, 18)}, ${day(1, 19)})`), /đã có người học/); ok("request over an approved lesson rejected");
await fails(as(T, `update bookings set status = 'approved' where id = ${b2.id}`), /no_double_booking/); ok("tutor cannot approve two overlapping lessons");
assert.deepEqual((await as(null, `select count(*)::int c from taken_slots(now(), now() + interval '7 day')`))[0].c, 1); ok("anon sees taken slots without names");
await fails(as(null, `select cancel_booking(${b2.id})`), /permission denied/); ok("anon cannot cancel");
await fails(as(A, `select cancel_booking(${b2.id})`), /Không thể huỷ/); ok("student cannot cancel someone else's lesson");
await as(B, `select cancel_booking(${b2.id})`);
assert.equal((await as(B, `select status from bookings`))[0].status, "cancelled"); ok("student cancels own lesson");

// lesson starting in 5 minutes: link visible; lesson already taught: owed
await as(T, `update bookings set start_at = now() + interval '5 min', end_at = now() + interval '95 min' where id = ${b1.id}`);
assert.equal((await as(A, `select url from meet_links`)).length, 1); ok("meet link visible 15 min before start");
assert.equal((await as(B, `select url from meet_links`)).length, 0); ok("other student never sees the link");
await as(T, `insert into bookings (student_id, start_at, end_at, status) values
  ('${A}', now() - interval '3 day', now() - interval '3 day' + interval '1 hour', 'approved'),
  ('${A}', now() - interval '2 day', now() - interval '2 day' + interval '1 hour', 'approved'),
  ('${A}', now() - interval '1 day', now() - interval '1 day' + interval '1 hour', 'approved')`);
await as(T, `update bookings set billable = false where start_at < now() - interval '2 day 12 hour'`);
await as(T, `update bookings set paid = true where start_at < now() - interval '1 day 12 hour' and start_at > now() - interval '2 day 12 hour'`);
const [feeA] = await as(A, `select * from fee_summary`);
assert.equal(Number(feeA.sessions_taught), 3); assert.equal(Number(feeA.sessions_owed), 1);
assert.equal(Number(feeA.amount_owed), 100000); assert.equal(Number(feeA.amount_paid), 100000); ok("fee summary: free lesson skipped, paid lesson counted, upcoming not owed");
assert.equal((await as(A, `select * from fee_summary`)).length, 1); ok("student sees only own fee row");
assert.equal((await as(T, `select * from fee_summary`)).length, 2); ok("tutor sees all students' fees");

// materials + storage
await as(T, `insert into storage.objects (bucket_id, name) values ('materials','s/all.pdf'),('materials','s/a.pdf'),('materials','s/b.pdf')`);
await as(T, `insert into materials (title, file_path, file_name, student_id) values ('Chung','s/all.pdf','all.pdf',null),('Cho An','s/a.pdf','a.pdf','${A}'),('Cho Bình','s/b.pdf','b.pdf','${B}')`);
assert.deepEqual((await as(A, `select title from materials order by id`)).map(r => r.title), ["Chung", "Cho An"]); ok("student sees shared and own materials only");
assert.deepEqual((await as(A, `select name from storage.objects order by name`)).map(r => r.name), ["s/a.pdf", "s/all.pdf"]); ok("student downloads only allowed files");
await fails(as(A, `insert into storage.objects (bucket_id, name) values ('materials','x')`), /row-level security/); ok("student cannot upload");
assert.equal((await as(A, `delete from materials returning id`)).length, 0); ok("student cannot delete materials");

console.log(`\nall ${n} checks passed`);

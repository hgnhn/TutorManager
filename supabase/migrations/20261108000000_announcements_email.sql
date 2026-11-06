-- Announcements + email_log. Run in the SQL Editor after the earlier migrations.

create table public.announcements (
  id bigint generated always as identity primary key,
  title text not null check (btrim(title) <> ''),
  body text not null default '',
  student_id uuid references public.profiles on delete cascade, -- null = every student
  created_at timestamptz not null default now()
);
alter table public.announcements enable row level security;
create policy "students read theirs and shared" on public.announcements for select to authenticated
  using (public.is_tutor() or student_id is null or student_id = auth.uid());
create policy "tutor writes" on public.announcements for all to authenticated
  using (public.is_tutor()) with check (public.is_tutor());
grant select, insert, update, delete on public.announcements to authenticated;

-- Written only by Edge Functions with the service role; prevents duplicate emails.
create table public.email_log (
  key text primary key, -- e.g. 'lesson-1h:123'
  sent_at timestamptz not null default now()
);
alter table public.email_log enable row level security; -- no policies: only the service role gets in
revoke all on public.email_log from anon, authenticated;

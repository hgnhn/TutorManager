-- bananalab: tutor/student scheduling, tuition, materials.
-- Paste this whole file into Supabase Dashboard > SQL Editor (or `supabase db push`).

-- ---------- profiles & roles ----------
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text not null default '',
  role text not null default 'student' check (role in ('tutor', 'student')),
  created_at timestamptz not null default now()
);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.is_tutor() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'tutor')
$$;

alter table public.profiles enable row level security;
create policy "read self or tutor reads all" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_tutor());
create policy "edit own name" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke insert, update, delete on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated; -- role is never client-writable

-- ---------- settings (one row) ----------
create table public.settings (
  id int primary key default 1 check (id = 1),
  price_per_session int not null default 100000 check (price_per_session >= 0),
  bank_id text not null default '',      -- VietQR bank BIN or short name, e.g. 970436 / vcb
  account_no text not null default '',
  account_name text not null default ''
);
insert into public.settings default values;

alter table public.settings enable row level security;
create policy "signed-in users read" on public.settings for select to authenticated using (true);
create policy "tutor edits" on public.settings for update to authenticated
  using (public.is_tutor()) with check (public.is_tutor());
grant select, update on public.settings to authenticated;

-- tutor-only: default Meet link reused when approving
create table public.tutor_private (
  id int primary key default 1 check (id = 1),
  default_meet_link text not null default ''
);
insert into public.tutor_private default values;
alter table public.tutor_private enable row level security;
create policy "tutor only" on public.tutor_private for all to authenticated
  using (public.is_tutor()) with check (public.is_tutor());
grant select, update on public.tutor_private to authenticated;

-- ---------- availability (tutor's free time) ----------
create table public.availability (
  id bigint generated always as identity primary key,
  start_at timestamptz not null,
  end_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (end_at > start_at)
);
create index on public.availability (start_at);

alter table public.availability enable row level security;
create policy "anyone reads" on public.availability for select to anon, authenticated using (true);
create policy "tutor writes" on public.availability for all to authenticated
  using (public.is_tutor()) with check (public.is_tutor());
grant select on public.availability to anon;
grant select, insert, update, delete on public.availability to authenticated;

-- ---------- bookings ----------
create table public.bookings (
  id bigint generated always as identity primary key,
  student_id uuid not null default auth.uid() references public.profiles on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  note text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  billable boolean not null default true,
  price int not null default 0 check (price >= 0),
  paid boolean not null default false,
  tutor_note text not null default '',
  created_at timestamptz not null default now(),
  check (end_at > start_at),
  -- two approved lessons can never overlap
  constraint no_double_booking exclude using gist (tstzrange(start_at, end_at) with &&)
    where (status = 'approved')
);
create index on public.bookings (student_id, start_at);

-- Students may only create a pending request inside the tutor's free time.
create function public.bookings_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_tutor() then
    new.student_id := auth.uid();
    new.status := 'pending';
    new.billable := true;
    new.paid := false;
    new.tutor_note := '';
    if new.start_at <= now() then
      raise exception 'Không thể đặt khung giờ đã qua.';
    end if;
    if not exists (
      select 1 from public.availability a
      where a.start_at <= new.start_at and a.end_at >= new.end_at
    ) then
      raise exception 'Khung giờ này không nằm trong lịch rảnh.';
    end if;
    if exists (
      select 1 from public.bookings b
      where b.status = 'approved' and tstzrange(b.start_at, b.end_at) && tstzrange(new.start_at, new.end_at)
    ) then
      raise exception 'Khung giờ này đã có người học.';
    end if;
  end if;
  new.price := (select price_per_session from public.settings where id = 1);
  return new;
end $$;

create trigger bookings_before_insert before insert on public.bookings
  for each row execute function public.bookings_before_insert();

alter table public.bookings enable row level security;
create policy "student reads own, tutor reads all" on public.bookings for select to authenticated
  using (student_id = auth.uid() or public.is_tutor());
create policy "signed-in users request" on public.bookings for insert to authenticated
  with check (student_id = auth.uid() or public.is_tutor());
create policy "tutor updates" on public.bookings for update to authenticated
  using (public.is_tutor()) with check (public.is_tutor());
create policy "tutor deletes" on public.bookings for delete to authenticated
  using (public.is_tutor());
grant select, insert, update, delete on public.bookings to authenticated;

-- Student cancels their own lesson before it starts.
create function public.cancel_booking(booking_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.bookings set status = 'cancelled'
  where id = booking_id and student_id = auth.uid()
    and status in ('pending', 'approved') and start_at > now();
  if not found then
    raise exception 'Không thể huỷ buổi học này.';
  end if;
end $$;
revoke execute on function public.cancel_booking(bigint) from public, anon;
grant execute on function public.cancel_booking(bigint) to authenticated;

-- Approved lesson times without names, so the public calendar can grey them out.
create function public.taken_slots(from_ts timestamptz, to_ts timestamptz)
returns table (start_at timestamptz, end_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select b.start_at, b.end_at from public.bookings b
  where b.status = 'approved' and b.start_at < to_ts and b.end_at > from_ts
$$;
grant execute on function public.taken_slots(timestamptz, timestamptz) to anon, authenticated;

-- ---------- Meet links: visible to the student from 15 min before start ----------
create table public.meet_links (
  booking_id bigint primary key references public.bookings on delete cascade,
  url text not null
);
alter table public.meet_links enable row level security;
create policy "tutor manages" on public.meet_links for all to authenticated
  using (public.is_tutor()) with check (public.is_tutor());
create policy "student sees near start" on public.meet_links for select to authenticated
  using (exists (
    select 1 from public.bookings b
    where b.id = booking_id and b.student_id = auth.uid() and b.status = 'approved'
      and now() between b.start_at - interval '15 minutes' and b.end_at
  ));
grant select, insert, update, delete on public.meet_links to authenticated;

-- ---------- tuition summary ----------
-- Owed = approved, billable, unpaid lessons that have already started.
create view public.fee_summary with (security_invoker = true) as
select
  p.id as student_id,
  p.full_name,
  count(b.id) filter (where b.status = 'approved' and b.start_at <= now()) as sessions_taught,
  count(b.id) filter (where b.status = 'approved' and b.billable and not b.paid and b.start_at <= now()) as sessions_owed,
  coalesce(sum(b.price) filter (where b.status = 'approved' and b.billable and not b.paid and b.start_at <= now()), 0) as amount_owed,
  coalesce(sum(b.price) filter (where b.status = 'approved' and b.billable and b.paid), 0) as amount_paid
from public.profiles p
left join public.bookings b on b.student_id = p.id
where p.role = 'student'
group by p.id, p.full_name;
grant select on public.fee_summary to authenticated;

-- ---------- materials (files in private storage bucket "materials") ----------
create table public.materials (
  id bigint generated always as identity primary key,
  title text not null,
  description text not null default '',
  file_path text not null unique,
  file_name text not null,
  size_bytes bigint not null default 0,
  student_id uuid references public.profiles on delete cascade, -- null = every student
  created_at timestamptz not null default now()
);
alter table public.materials enable row level security;
create policy "students read theirs and shared" on public.materials for select to authenticated
  using (public.is_tutor() or student_id is null or student_id = auth.uid());
create policy "tutor writes" on public.materials for all to authenticated
  using (public.is_tutor()) with check (public.is_tutor());
grant select, insert, update, delete on public.materials to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('materials', 'materials', false, 52428800) -- 50 MB, Supabase free-tier cap
on conflict (id) do nothing;

create policy "tutor uploads materials" on storage.objects for insert to authenticated
  with check (bucket_id = 'materials' and public.is_tutor());
create policy "tutor deletes materials" on storage.objects for delete to authenticated
  using (bucket_id = 'materials' and public.is_tutor());
create policy "allowed users download materials" on storage.objects for select to authenticated
  using (bucket_id = 'materials' and (
    public.is_tutor() or exists (
      select 1 from public.materials m
      where m.file_path = name and (m.student_id is null or m.student_id = auth.uid())
    )
  ));

-- After your first sign-up, make yourself the tutor (replace the email):
-- update public.profiles set role = 'tutor'
-- where id = (select id from auth.users where email = 'you@example.com');

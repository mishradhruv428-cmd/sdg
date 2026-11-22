-- Campus Cab Share: Supabase schema and access policies
-- Run this once in Supabase SQL Editor for a new project.
-- Never expose the Supabase service-role key in the browser.

-- 1) Domain restriction for new Supabase Auth accounts.
create or replace function public.require_bennett_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is null
     or right(lower(new.email), char_length('@bennett.edu.in')) <> '@bennett.edu.in' then
    raise exception using
      message = 'Please use your Bennett University email.',
      errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists require_bennett_email_before_insert on auth.users;
create trigger require_bennett_email_before_insert
before insert on auth.users
for each row execute function public.require_bennett_email();

create or replace function public.is_bennett_student()
returns boolean
language sql
stable
set search_path = ''
as $$
  select right(
    lower(coalesce(auth.jwt() ->> 'email', '')),
    char_length('@bennett.edu.in')
  ) = '@bennett.edu.in';
$$;

-- 2) Student profile data is split so public names do not expose phone/email.
create table if not exists public.students (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 100),
  gender text check (gender in ('female', 'male', 'non_binary', 'prefer_not_to_say')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Email and phone are visible only to the student and ride-mates.
create table if not exists public.student_private (
  student_id uuid primary key references public.students(id) on delete cascade,
  email text not null unique,
  phone text not null check (char_length(trim(phone)) >= 7),
  updated_at timestamptz not null default now()
);

-- 3) Rides. seats_total means the seats offered to other students (1-6).
create table if not exists public.rides (
  id uuid primary key default gen_random_uuid(),
  from_location text not null check (char_length(trim(from_location)) between 2 and 120),
  to_location text not null check (char_length(trim(to_location)) between 2 and 120),
  depart_at timestamptz not null,
  seats_total smallint not null check (seats_total between 1 and 6),
  estimated_total_fare integer not null check (estimated_total_fare >= 0),
  distance_km numeric(8,2) not null check (distance_km >= 0),
  note text,
  women_only boolean not null default false,
  posted_by uuid not null references public.students(id) on delete cascade,
  status text not null default 'open'
    check (status in ('open', 'full', 'cancelled', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rides_depart_at_idx on public.rides (depart_at);
create index if not exists rides_status_depart_at_idx on public.rides (status, depart_at);
create index if not exists rides_posted_by_idx on public.rides (posted_by);

-- Join rows track students who joined. The poster is not a join row; seats_total
-- is the number of seats available to join, and the poster counts as a rider
-- when fares and impact are calculated.
create table if not exists public.ride_members (
  ride_id uuid not null references public.rides(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (ride_id, student_id)
);

create index if not exists ride_members_student_idx on public.ride_members (student_id);

-- 4) A security-definer helper checks whether two students share a ride.
-- It deliberately returns only a boolean; contact data stays in a separate table.
create or replace function public.students_share_a_ride(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
set row_security = off
as $$
  select exists (
    select 1
    from public.rides r
    where (
      r.posted_by = auth.uid()
      or exists (
        select 1 from public.ride_members mine
        where mine.ride_id = r.id and mine.student_id = auth.uid()
      )
    )
    and (
      r.posted_by = p_student_id
      or exists (
        select 1 from public.ride_members theirs
        where theirs.ride_id = r.id and theirs.student_id = p_student_id
      )
    )
  );
$$;

-- 5) Profile completion is atomic: a student row and its private contact row
-- are saved together, using the authenticated email from the JWT.
create or replace function public.complete_student_profile(
  p_name text,
  p_phone text,
  p_gender text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
set row_security = off
as $$
declare
  v_student_id uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if v_student_id is null or not public.is_bennett_student() then
    raise exception 'Please use your Bennett University email.';
  end if;
  if char_length(trim(coalesce(p_name, ''))) < 2
     or char_length(trim(coalesce(p_name, ''))) > 100 then
    raise exception 'Enter a name between 2 and 100 characters.';
  end if;
  if char_length(trim(coalesce(p_phone, ''))) < 7 then
    raise exception 'Enter a valid phone number.';
  end if;
  if p_gender is not null and p_gender not in ('female', 'male', 'non_binary', 'prefer_not_to_say') then
    raise exception 'Choose a valid gender option.';
  end if;

  insert into public.students (id, name, gender)
  values (v_student_id, trim(p_name), p_gender)
  on conflict (id) do update
    set name = excluded.name, gender = excluded.gender, updated_at = now();

  insert into public.student_private (student_id, email, phone)
  values (v_student_id, v_email, trim(p_phone))
  on conflict (student_id) do update
    set email = excluded.email, phone = excluded.phone, updated_at = now();
end;
$$;

-- 6) Row-level security. No anonymous role receives access to student or ride data.
alter table public.students enable row level security;
alter table public.student_private enable row level security;
alter table public.rides enable row level security;
alter table public.ride_members enable row level security;

-- Authenticated Bennett students can see names/gender used on ride cards.
drop policy if exists "Bennett students can read student cards" on public.students;
create policy "Bennett students can read student cards"
on public.students for select to authenticated
using (public.is_bennett_student());

drop policy if exists "Students can create their own profile" on public.students;
create policy "Students can create their own profile"
on public.students for insert to authenticated
with check (id = auth.uid() and public.is_bennett_student());

drop policy if exists "Students can update their own profile" on public.students;
create policy "Students can update their own profile"
on public.students for update to authenticated
using (id = auth.uid() and public.is_bennett_student())
with check (id = auth.uid() and public.is_bennett_student());

-- Contact details are restricted to the owner or students who share a ride.
drop policy if exists "Students can read own or ride-mate contacts" on public.student_private;
create policy "Students can read own or ride-mate contacts"
on public.student_private for select to authenticated
using (
  public.is_bennett_student()
  and (student_id = auth.uid() or public.students_share_a_ride(student_id))
);

drop policy if exists "Students can insert own contact" on public.student_private;
create policy "Students can insert own contact"
on public.student_private for insert to authenticated
with check (student_id = auth.uid() and public.is_bennett_student());

drop policy if exists "Students can update own contact" on public.student_private;
create policy "Students can update own contact"
on public.student_private for update to authenticated
using (student_id = auth.uid() and public.is_bennett_student())
with check (student_id = auth.uid() and public.is_bennett_student());

-- All signed-in Bennett students can browse open/full rides; posters can also
-- see their own cancelled/completed rides. Only posters can update their rides.
drop policy if exists "Bennett students can read available rides" on public.rides;
create policy "Bennett students can read available rides"
on public.rides for select to authenticated
using (
  public.is_bennett_student()
  and (status in ('open', 'full') or posted_by = auth.uid())
);

drop policy if exists "Students can post their own rides" on public.rides;
create policy "Students can post their own rides"
on public.rides for insert to authenticated
with check (posted_by = auth.uid() and status = 'open' and public.is_bennett_student());

drop policy if exists "Only poster can edit or cancel ride" on public.rides;
create policy "Only poster can edit or cancel ride"
on public.rides for update to authenticated
using (posted_by = auth.uid() and public.is_bennett_student())
with check (posted_by = auth.uid() and public.is_bennett_student());

-- Membership names/counts are readable to signed-in Bennett students. Contact
-- details are not part of this table and remain protected above.
drop policy if exists "Bennett students can read ride memberships" on public.ride_members;
create policy "Bennett students can read ride memberships"
on public.ride_members for select to authenticated
using (public.is_bennett_student());

-- Joining is an RPC so the ride row is locked while capacity is checked; two
-- students cannot claim the last seat at the same time. UI can call this later.
create or replace function public.join_ride(p_ride_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
set row_security = off
as $$
declare
  v_ride public.rides%rowtype;
  v_joined integer;
  v_student_id uuid := auth.uid();
begin
  if v_student_id is null or not public.is_bennett_student() then
    raise exception 'Please sign in with your Bennett University email.';
  end if;

  select * into v_ride
  from public.rides
  where id = p_ride_id
  for update;

  if not found then raise exception 'Ride not found.'; end if;
  if v_ride.status <> 'open' then raise exception 'This ride is no longer open.'; end if;
  if v_ride.posted_by = v_student_id then raise exception 'You posted this ride.'; end if;

  select count(*) into v_joined
  from public.ride_members
  where ride_id = p_ride_id;

  if v_joined >= v_ride.seats_total then raise exception 'This ride is full.'; end if;

  insert into public.ride_members (ride_id, student_id)
  values (p_ride_id, v_student_id);

  if v_joined + 1 >= v_ride.seats_total then
    update public.rides set status = 'full', updated_at = now() where id = p_ride_id;
  end if;
end;
$$;

-- 7) Grant only the operations needed by the client. RLS still filters rows.
grant usage on schema public to authenticated;
grant select, insert, update on public.students to authenticated;
grant select, insert, update on public.student_private to authenticated;
grant select, insert, update on public.rides to authenticated;
grant select on public.ride_members to authenticated;
-- Revoke default PUBLIC execution before granting these only to signed-in students.
revoke all on function public.require_bennett_email() from public, anon, authenticated;
revoke all on function public.is_bennett_student() from public, anon;
revoke all on function public.students_share_a_ride(uuid) from public, anon;
revoke all on function public.complete_student_profile(text, text, text) from public, anon;
revoke all on function public.join_ride(uuid) from public, anon;

grant execute on function public.is_bennett_student() to authenticated;
grant execute on function public.students_share_a_ride(uuid) to authenticated;
grant execute on function public.complete_student_profile(text, text, text) to authenticated;
grant execute on function public.join_ride(uuid) to authenticated;

-- IMPORTANT: If email confirmation is enabled in Supabase Auth, students must
-- confirm their Bennett address before signing in. The frontend shows that state.

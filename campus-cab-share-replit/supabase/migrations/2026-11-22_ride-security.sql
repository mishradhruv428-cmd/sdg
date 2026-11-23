-- Campus Cab Share: safe ride lifecycle and contact access
-- Run once on an existing Supabase project after taking a database backup.
-- Safe to re-run: policies and functions are replaced; existing ride data is kept.

begin;

drop policy if exists "Bennett students can read available rides" on public.rides;
create policy "Bennett students can read available rides"
on public.rides for select to authenticated
using (
  public.is_bennett_student()
  and (
    status in ('open', 'full', 'completed')
    or posted_by = auth.uid()
    or exists (
      select 1 from public.ride_members rm
      where rm.ride_id = rides.id and rm.student_id = auth.uid()
    )
  )
);

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
    where r.depart_at > now()
      and r.status in ('open', 'full')
      and (
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

drop policy if exists "Students can read own or ride-mate contacts" on public.student_private;
create policy "Students can read own or ride-mate contacts"
on public.student_private for select to authenticated
using (
  public.is_bennett_student()
  and (student_id = auth.uid() or public.students_share_a_ride(student_id))
);

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
  v_gender text;
  v_student_id uuid := auth.uid();
begin
  if v_student_id is null or not public.is_bennett_student() then
    raise exception 'Please sign in with your Bennett University email.';
  end if;
  select * into v_ride from public.rides where id = p_ride_id for update;
  if not found then raise exception 'Ride not found.'; end if;
  if v_ride.status <> 'open' then raise exception 'This ride is no longer open.'; end if;
  if v_ride.depart_at <= now() then raise exception 'This ride has already departed.'; end if;
  if v_ride.posted_by = v_student_id then raise exception 'You posted this ride.'; end if;
  if exists (
    select 1 from public.ride_members
    where ride_id = p_ride_id and student_id = v_student_id
  ) then raise exception 'You have already joined this ride.'; end if;
  if v_ride.women_only then
    select gender into v_gender from public.students where id = v_student_id;
    if v_gender is distinct from 'female' then
      raise exception 'This ride is limited to students whose profile is set to female.';
    end if;
  end if;
  select count(*) into v_joined from public.ride_members where ride_id = p_ride_id;
  if v_joined >= v_ride.seats_total then raise exception 'This ride is full.'; end if;
  insert into public.ride_members (ride_id, student_id) values (p_ride_id, v_student_id);
  if v_joined + 1 >= v_ride.seats_total then
    update public.rides set status = 'full', updated_at = now() where id = p_ride_id;
  end if;
end;
$$;

create or replace function public.cancel_ride(p_ride_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
set row_security = off
as $$
declare
  v_ride public.rides%rowtype;
  v_student_id uuid := auth.uid();
begin
  if v_student_id is null or not public.is_bennett_student() then
    raise exception 'Please sign in with your Bennett University email.';
  end if;
  select * into v_ride from public.rides where id = p_ride_id for update;
  if not found then raise exception 'Ride not found.'; end if;
  if v_ride.posted_by <> v_student_id then raise exception 'Only the ride poster can cancel this ride.'; end if;
  if v_ride.status not in ('open', 'full') or v_ride.depart_at <= now() then
    raise exception 'This ride can no longer be cancelled.';
  end if;
  update public.rides set status = 'cancelled', updated_at = now() where id = p_ride_id;
end;
$$;

create or replace function public.leave_ride(p_ride_id uuid)
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
  select * into v_ride from public.rides where id = p_ride_id for update;
  if not found then raise exception 'Ride not found.'; end if;
  if v_ride.depart_at <= now() or v_ride.status not in ('open', 'full') then
    raise exception 'You can only leave an upcoming active ride.';
  end if;
  delete from public.ride_members
  where ride_id = p_ride_id and student_id = v_student_id;
  if not found then raise exception 'You have not joined this ride.'; end if;
  select count(*) into v_joined from public.ride_members where ride_id = p_ride_id;
  update public.rides
  set status = case when v_joined >= v_ride.seats_total then 'full' else 'open' end,
      updated_at = now()
  where id = p_ride_id;
end;
$$;

create or replace function public.mark_departed_rides_completed()
returns void
language plpgsql
security definer
set search_path = public, auth
set row_security = off
as $$
begin
  if auth.uid() is null or not public.is_bennett_student() then
    raise exception 'Please sign in with your Bennett University email.';
  end if;
  update public.rides
  set status = 'completed', updated_at = now()
  where status in ('open', 'full') and depart_at <= now();
end;
$$;

drop policy if exists "Only poster can edit or cancel ride" on public.rides;
revoke update on table public.rides from authenticated;

revoke all on function public.students_share_a_ride(uuid) from public, anon;
revoke all on function public.join_ride(uuid) from public, anon;
revoke all on function public.cancel_ride(uuid) from public, anon;
revoke all on function public.leave_ride(uuid) from public, anon;
revoke all on function public.mark_departed_rides_completed() from public, anon;

grant execute on function public.students_share_a_ride(uuid) to authenticated;
grant execute on function public.join_ride(uuid) to authenticated;
grant execute on function public.cancel_ride(uuid) to authenticated;
grant execute on function public.leave_ride(uuid) to authenticated;
grant execute on function public.mark_departed_rides_completed() to authenticated;

commit;

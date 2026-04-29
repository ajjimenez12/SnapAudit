-- SnapAudit (single-user-per-account) schema for Supabase
-- Notes:
-- - Run this in the Supabase SQL editor.
-- - Create a Storage bucket named: photos (private recommended)
-- - Then enable RLS policies below.

create extension if not exists pgcrypto;

create table if not exists public.sessions (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  location text,
  location_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'auditor' check (role in ('admin', 'auditor')),
  full_name text,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now()
);

alter table if exists public.profiles
  add column if not exists is_hidden boolean not null default false;

create table if not exists public.locations (
  id text primary key,
  name text not null unique
);

create table if not exists public.user_locations (
  user_id uuid not null references public.profiles (id) on delete cascade,
  location_id text not null references public.locations (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, location_id)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sessions_location_id_fkey'
  ) then
    alter table public.sessions
      add constraint sessions_location_id_fkey
      foreign key (location_id) references public.locations (id) on delete set null;
  end if;
end $$;

create table if not exists public.photos (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  tag text not null,
  comment text not null default '',
  storage_path text not null,
  created_at timestamptz not null default now()
);

alter table public.sessions enable row level security;
alter table public.photos enable row level security;
alter table public.profiles enable row level security;
alter table public.locations enable row level security;
alter table public.user_locations enable row level security;

create or replace function public.is_admin(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = check_user_id
      and p.role = 'admin'
  );
$$;

revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to authenticated;

-- Per-user isolation (users do not see each other's data)
drop policy if exists "sessions_select_own" on public.sessions;
drop policy if exists "sessions_insert_own" on public.sessions;
drop policy if exists "sessions_update_own" on public.sessions;
drop policy if exists "sessions_delete_own" on public.sessions;

create policy "sessions_select_own" on public.sessions
for select using (auth.uid() = user_id);
create policy "sessions_insert_own" on public.sessions
for insert with check (auth.uid() = user_id);
create policy "sessions_update_own" on public.sessions
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "sessions_delete_own" on public.sessions
for delete using (auth.uid() = user_id);

drop policy if exists "photos_select_own" on public.photos;
drop policy if exists "photos_insert_own" on public.photos;
drop policy if exists "photos_update_own" on public.photos;
drop policy if exists "photos_delete_own" on public.photos;

create policy "photos_select_own" on public.photos
for select using (auth.uid() = user_id);
create policy "photos_insert_own" on public.photos
for insert with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.sessions s
    where s.id = session_id
      and s.user_id = auth.uid()
  )
);
create policy "photos_update_own" on public.photos
for update using (
  auth.uid() = user_id
) with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.sessions s
    where s.id = session_id
      and s.user_id = auth.uid()
  )
);
create policy "photos_delete_own" on public.photos
for delete using (auth.uid() = user_id);

drop policy if exists profiles_insert on public.profiles;
drop policy if exists profiles_read_admin on public.profiles;
drop policy if exists profiles_read_own on public.profiles;
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_update on public.profiles;
drop policy if exists profiles_update_admin on public.profiles;

drop policy if exists locations_delete on public.locations;
drop policy if exists locations_insert on public.locations;
drop policy if exists locations_read_all on public.locations;
drop policy if exists locations_select on public.locations;
drop policy if exists locations_update on public.locations;
drop policy if exists locations_write_admin on public.locations;

drop policy if exists user_locations_delete on public.user_locations;
drop policy if exists user_locations_insert on public.user_locations;
drop policy if exists user_locations_select on public.user_locations;
drop policy if exists user_locations_update on public.user_locations;

create policy profiles_select on public.profiles
for select using (auth.uid() = id or public.is_admin());

create policy profiles_insert on public.profiles
for insert with check (auth.uid() = id or public.is_admin());

create policy profiles_update on public.profiles
for update using (auth.uid() = id or public.is_admin())
with check (auth.uid() = id or public.is_admin());

create policy locations_select on public.locations
for select to authenticated
using (true);

create policy locations_insert on public.locations
for insert to authenticated
with check (public.is_admin());

create policy locations_update on public.locations
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy locations_delete on public.locations
for delete to authenticated
using (public.is_admin());

create policy user_locations_select on public.user_locations
for select to authenticated
using (auth.uid() = user_id or public.is_admin());

create policy user_locations_insert on public.user_locations
for insert to authenticated
with check (public.is_admin());

create policy user_locations_update on public.user_locations
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy user_locations_delete on public.user_locations
for delete to authenticated
using (public.is_admin());

create or replace view public.admin_user_directory as
select
  p.id,
  p.role,
  p.full_name,
  u.email
from public.profiles p
join auth.users u on u.id = p.id
where coalesce(p.is_hidden, false) = false;

revoke all on public.admin_user_directory from public;
grant select on public.admin_user_directory to authenticated;

-- Optional: index helpers
create index if not exists sessions_user_created_at on public.sessions (user_id, created_at desc);
create index if not exists photos_user_created_at on public.photos (user_id, created_at desc);
create index if not exists photos_session_id on public.photos (session_id);
create index if not exists sessions_location_id on public.sessions (location_id);
create index if not exists user_locations_user_id on public.user_locations (user_id);
create index if not exists user_locations_location_id on public.user_locations (location_id);

-- Storage policies for a private bucket named "photos".
-- Path convention: "<auth.uid()>/<photoId>.jpg"
-- Note: Supabase manages RLS on `storage.objects`. You may not have privileges to
-- run `ALTER TABLE storage.objects ...` from the SQL editor; create policies only.

drop policy if exists "photos_bucket_select_own" on storage.objects;
drop policy if exists "photos_bucket_insert_own" on storage.objects;
drop policy if exists "photos_bucket_update_own" on storage.objects;
drop policy if exists "photos_bucket_delete_own" on storage.objects;

create policy "photos_bucket_select_own" on storage.objects
for select to authenticated
using (
  bucket_id = 'photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "photos_bucket_insert_own" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "photos_bucket_update_own" on storage.objects
for update to authenticated
using (
  bucket_id = 'photos'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "photos_bucket_delete_own" on storage.objects
for delete to authenticated
using (
  bucket_id = 'photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

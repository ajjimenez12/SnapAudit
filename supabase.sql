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
  created_at timestamptz not null default now()
);

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

-- Per-user isolation (users do not see each other's data)
create policy "sessions_select_own" on public.sessions
for select using (auth.uid() = user_id);
create policy "sessions_insert_own" on public.sessions
for insert with check (auth.uid() = user_id);
create policy "sessions_update_own" on public.sessions
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "sessions_delete_own" on public.sessions
for delete using (auth.uid() = user_id);

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

-- Optional: index helpers
create index if not exists sessions_user_created_at on public.sessions (user_id, created_at desc);
create index if not exists photos_user_created_at on public.photos (user_id, created_at desc);
create index if not exists photos_session_id on public.photos (session_id);

-- Storage policies for a private bucket named "photos".
-- Path convention: "<auth.uid()>/<photoId>.jpg"
-- Note: Supabase manages RLS on `storage.objects`. You may not have privileges to
-- run `ALTER TABLE storage.objects ...` from the SQL editor; create policies only.

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

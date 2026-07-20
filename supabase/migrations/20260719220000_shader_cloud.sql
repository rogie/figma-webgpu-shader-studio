create extension if not exists pgcrypto;

create table if not exists public.shaders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  source text not null,
  kind text not null check (kind in ('effect', 'fill')),
  parameter_values jsonb not null default '{}'::jsonb,
  features jsonb not null default '{}'::jsonb,
  is_public boolean not null default false,
  input_path text,
  input_name text,
  input_mime_type text,
  thumbnail_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shaders_owner_updated_idx
  on public.shaders (owner_id, updated_at desc);

create index if not exists shaders_public_updated_idx
  on public.shaders (updated_at desc)
  where is_public;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists shaders_set_updated_at on public.shaders;
create trigger shaders_set_updated_at
before update on public.shaders
for each row execute function public.set_updated_at();

alter table public.shaders enable row level security;

drop policy if exists "Public shaders and owned drafts are readable" on public.shaders;
create policy "Public shaders and owned drafts are readable"
on public.shaders for select
using (is_public or (select auth.uid()) = owner_id);

drop policy if exists "Users can create their own shaders" on public.shaders;
create policy "Users can create their own shaders"
on public.shaders for insert
to authenticated
with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners can update shaders" on public.shaders;
create policy "Owners can update shaders"
on public.shaders for update
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners can delete shaders" on public.shaders;
create policy "Owners can delete shaders"
on public.shaders for delete
to authenticated
using ((select auth.uid()) = owner_id);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'shader-assets',
  'shader-assets',
  false,
  26214400,
  array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'image/avif',
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'video/x-m4v'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Shader assets follow shader visibility" on storage.objects;
create policy "Shader assets follow shader visibility"
on storage.objects for select
using (
  bucket_id = 'shader-assets'
  and exists (
    select 1
    from public.shaders
    where shaders.id::text = (storage.foldername(name))[2]
      and shaders.owner_id::text = (storage.foldername(name))[1]
      and (
        shaders.is_public
        or shaders.owner_id = (select auth.uid())
      )
  )
);

drop policy if exists "Owners can upload shader assets" on storage.objects;
create policy "Owners can upload shader assets"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'shader-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.shaders
    where shaders.id::text = (storage.foldername(name))[2]
      and shaders.owner_id = (select auth.uid())
  )
);

drop policy if exists "Owners can update shader assets" on storage.objects;
create policy "Owners can update shader assets"
on storage.objects for update
to authenticated
using (
  bucket_id = 'shader-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'shader-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Owners can delete shader assets" on storage.objects;
create policy "Owners can delete shader assets"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'shader-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

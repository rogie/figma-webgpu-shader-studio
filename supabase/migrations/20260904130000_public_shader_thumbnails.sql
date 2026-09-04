alter table public.shaders
add column if not exists thumbnail_bucket text not null default 'shader-assets',
add column if not exists thumbnail_small_path text;

alter table public.shaders
drop constraint if exists shaders_thumbnail_bucket_check;

alter table public.shaders
add constraint shaders_thumbnail_bucket_check
check (thumbnail_bucket in ('shader-assets', 'shader-thumbnails'));

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'shader-thumbnails',
  'shader-thumbnails',
  true,
  5242880,
  array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/avif'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Owners can upload public shader thumbnails"
on storage.objects;
create policy "Owners can upload public shader thumbnails"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'shader-thumbnails'
  and (storage.foldername(storage.objects.name))[1] =
    (select auth.uid())::text
  and storage.objects.name ~ (
    '^'
    || (select auth.uid())::text
    || '/[0-9a-f-]{36}/assets/thumbnail(-small)?-[0-9a-f]{64}\.[a-z0-9]+$'
  )
);

drop policy if exists "Owners can delete public shader thumbnails"
on storage.objects;
create policy "Owners can delete public shader thumbnails"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'shader-thumbnails'
  and (storage.foldername(storage.objects.name))[1] =
    (select auth.uid())::text
);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'shader-plans',
  'shader-plans',
  false,
  1048576,
  array['text/markdown']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Owners can read shader plans" on storage.objects;
create policy "Owners can read shader plans"
on storage.objects for select
to authenticated
using (
  bucket_id = 'shader-plans'
  and (storage.foldername(storage.objects.name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.shaders
    where shaders.id::text = (storage.foldername(storage.objects.name))[2]
      and shaders.owner_id = (select auth.uid())
  )
);

drop policy if exists "Owners can upload shader plans" on storage.objects;
create policy "Owners can upload shader plans"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'shader-plans'
  and (storage.foldername(storage.objects.name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.shaders
    where shaders.id::text = (storage.foldername(storage.objects.name))[2]
      and shaders.owner_id = (select auth.uid())
  )
);

drop policy if exists "Owners can update shader plans" on storage.objects;
create policy "Owners can update shader plans"
on storage.objects for update
to authenticated
using (
  bucket_id = 'shader-plans'
  and (storage.foldername(storage.objects.name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'shader-plans'
  and (storage.foldername(storage.objects.name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.shaders
    where shaders.id::text = (storage.foldername(storage.objects.name))[2]
      and shaders.owner_id = (select auth.uid())
  )
);

drop policy if exists "Owners can delete shader plans" on storage.objects;
create policy "Owners can delete shader plans"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'shader-plans'
  and (storage.foldername(storage.objects.name))[1] = (select auth.uid())::text
);

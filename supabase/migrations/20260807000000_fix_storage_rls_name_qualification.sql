-- Fix storage RLS: unqualified `name` inside EXISTS (SELECT … FROM shaders)
-- was resolving to shaders.name (title), not storage.objects.name (path).
-- That made thumbnail/input uploads fail with RLS violations on publish/save.

drop policy if exists "Shader assets follow shader visibility" on storage.objects;
create policy "Shader assets follow shader visibility"
on storage.objects for select
using (
  bucket_id = 'shader-assets'
  and exists (
    select 1
    from public.shaders
    where shaders.id::text = (storage.foldername(storage.objects.name))[2]
      and shaders.owner_id::text = (storage.foldername(storage.objects.name))[1]
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
  and (storage.foldername(storage.objects.name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.shaders
    where shaders.id::text = (storage.foldername(storage.objects.name))[2]
      and shaders.owner_id = (select auth.uid())
  )
);

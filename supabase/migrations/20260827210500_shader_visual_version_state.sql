-- Make shader revisions and checkpoints cover the complete visual document.
alter table public.shaders
  add column if not exists dependency_snapshots jsonb
    not null default '{}'::jsonb;

alter table public.shader_versions
  add column if not exists input_path text,
  add column if not exists input_name text,
  add column if not exists input_mime_type text,
  add column if not exists dependency_snapshots jsonb
    not null default '{}'::jsonb,
  add column if not exists snapshot_schema_version smallint;

alter table public.shader_versions
  alter column snapshot_schema_version set default 2;

alter table public.shaders
  drop constraint if exists shaders_dependency_snapshots_object_check;
alter table public.shaders
  add constraint shaders_dependency_snapshots_object_check
  check (jsonb_typeof(dependency_snapshots) = 'object');

alter table public.shader_versions
  drop constraint if exists shader_versions_dependency_snapshots_object_check;
alter table public.shader_versions
  add constraint shader_versions_dependency_snapshots_object_check
  check (jsonb_typeof(dependency_snapshots) = 'object');

alter table public.shader_versions
  drop constraint if exists shader_versions_snapshot_schema_version_check;
alter table public.shader_versions
  add constraint shader_versions_snapshot_schema_version_check
  check (
    snapshot_schema_version is null
    or snapshot_schema_version = 2
  );

alter table public.shader_versions
  drop constraint if exists shader_versions_checkpoint_kind_check;
alter table public.shader_versions
  add constraint shader_versions_checkpoint_kind_check
  check (
    checkpoint_kind in (
      'initial',
      'manual',
      'publish',
      'agent',
      'before_restore',
      'restore',
      'migration'
    )
  );

-- Older revisions cannot be proven to contain the composition or media that
-- was current when they were recorded. Preserve them as incomplete history
-- and append one honest, complete checkpoint for the current visual state.
insert into public.shader_versions (
  shader_id,
  version_number,
  state_revision,
  checkpoint_kind,
  summary,
  source,
  kind,
  parameter_values,
  features,
  composition,
  input_path,
  input_name,
  input_mime_type,
  dependency_snapshots,
  snapshot_schema_version,
  created_by
)
select
  shaders.id,
  coalesce(
    (
      select max(existing.version_number)
      from public.shader_versions as existing
      where existing.shader_id = shaders.id
    ),
    0
  ) + 1,
  shaders.state_revision,
  'migration',
  'Complete visual state migration',
  shaders.source,
  shaders.kind,
  shaders.parameter_values,
  shaders.features,
  shaders.composition,
  shaders.input_path,
  shaders.input_name,
  shaders.input_mime_type,
  shaders.dependency_snapshots,
  2,
  shaders.owner_id
from public.shaders as shaders
where not exists (
  select 1
  from public.shader_versions as complete
  where complete.shader_id = shaders.id
    and complete.snapshot_schema_version = 2
);

alter table public.shaders disable trigger shaders_set_updated_at;
update public.shaders
set versioned_state_revision = state_revision
where versioned_state_revision is distinct from state_revision;
alter table public.shaders enable trigger shaders_set_updated_at;

create or replace function public.track_shader_state_revision()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_state_changed boolean;
begin
  v_state_changed :=
    old.source is distinct from new.source
    or old.kind is distinct from new.kind
    or old.parameter_values is distinct from new.parameter_values
    or old.features is distinct from new.features
    or old.composition is distinct from new.composition
    or old.input_path is distinct from new.input_path
    or old.input_name is distinct from new.input_name
    or old.input_mime_type is distinct from new.input_mime_type
    or old.dependency_snapshots is distinct from new.dependency_snapshots;

  if v_state_changed then
    new.state_revision := old.state_revision + 1;
  elsif current_user in ('anon', 'authenticated') then
    new.state_revision := old.state_revision;
  end if;

  if current_user in ('anon', 'authenticated') then
    new.versioned_state_revision := old.versioned_state_revision;
  end if;
  return new;
end;
$$;

create or replace function public.seed_initial_shader_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.shader_versions (
    shader_id,
    version_number,
    state_revision,
    checkpoint_kind,
    summary,
    source,
    kind,
    parameter_values,
    features,
    composition,
    input_path,
    input_name,
    input_mime_type,
    dependency_snapshots,
    created_by,
    created_at
  )
  values (
    new.id,
    1,
    new.state_revision,
    'initial',
    'Initial saved version',
    new.source,
    new.kind,
    new.parameter_values,
    new.features,
    new.composition,
    new.input_path,
    new.input_name,
    new.input_mime_type,
    new.dependency_snapshots,
    new.owner_id,
    new.created_at
  )
  on conflict (shader_id, version_number) do nothing;
  return new;
end;
$$;

-- The original nine arguments stay in their existing order. New optional
-- arguments are appended so existing positional and PostgREST named calls
-- continue to resolve to this function.
drop function if exists public.save_shader_state(
  uuid,
  bigint,
  text,
  text,
  jsonb,
  jsonb,
  text,
  text,
  jsonb
);

create function public.save_shader_state(
  p_shader_id uuid,
  p_expected_state_revision bigint,
  p_source text,
  p_kind text,
  p_parameter_values jsonb,
  p_features jsonb,
  p_checkpoint_kind text default null,
  p_summary text default null,
  p_composition jsonb default '{}'::jsonb,
  p_input_path text default null,
  p_input_name text default null,
  p_input_mime_type text default null,
  p_dependency_snapshots jsonb default null,
  p_checkpoint_dependency_snapshots jsonb default null,
  p_input_fields_present boolean default false
)
returns public.shaders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shader public.shaders;
  v_latest public.shader_versions;
  v_next_version bigint;
  v_changed boolean;
  v_input_fields_present boolean;
  v_input_path text;
  v_input_name text;
  v_input_mime_type text;
  v_dependency_snapshots jsonb;
  v_checkpoint_dependency_snapshots jsonb;
begin
  perform set_config('lock_timeout', '5000', true);

  select *
  into v_shader
  from public.shaders
  where id = p_shader_id
  for update;

  if not found
    or v_shader.owner_id is distinct from (select auth.uid()) then
    raise exception 'shader_not_found' using errcode = 'P0002';
  end if;

  if p_expected_state_revision is not null
    and v_shader.state_revision <> p_expected_state_revision then
    raise exception 'shader_state_conflict' using errcode = '40001';
  end if;

  if p_kind not in ('effect', 'fill', 'composition') then
    raise exception 'invalid_shader_kind' using errcode = '22023';
  end if;

  -- Older clients omit the new media arguments. Preserve the stored values
  -- in that case, while still allowing newer clients to explicitly clear all
  -- three fields by setting p_input_fields_present.
  v_input_fields_present :=
    coalesce(p_input_fields_present, false)
    or p_input_path is not null
    or p_input_name is not null
    or p_input_mime_type is not null;
  v_input_path := case
    when v_input_fields_present then p_input_path
    else v_shader.input_path
  end;
  v_input_name := case
    when v_input_fields_present then p_input_name
    else v_shader.input_name
  end;
  v_input_mime_type := case
    when v_input_fields_present then p_input_mime_type
    else v_shader.input_mime_type
  end;

  -- A checkpoint's dependency pins are part of the same canonical live
  -- document. Keeping a divergent checkpoint-only graph would make the row's
  -- versioned revision claim state that no version can actually restore.
  v_dependency_snapshots := coalesce(
    case
      when p_checkpoint_kind is not null
        then p_checkpoint_dependency_snapshots
      else null
    end,
    p_dependency_snapshots,
    v_shader.dependency_snapshots,
    '{}'::jsonb
  );

  v_changed :=
    v_shader.source is distinct from p_source
    or v_shader.kind is distinct from p_kind
    or v_shader.parameter_values is distinct from coalesce(
      p_parameter_values,
      '{}'::jsonb
    )
    or v_shader.features is distinct from coalesce(p_features, '{}'::jsonb)
    or v_shader.composition is distinct from coalesce(
      p_composition,
      '{}'::jsonb
    )
    or v_shader.input_path is distinct from v_input_path
    or v_shader.input_name is distinct from v_input_name
    or v_shader.input_mime_type is distinct from v_input_mime_type
    or v_shader.dependency_snapshots
      is distinct from v_dependency_snapshots;

  if v_changed then
    update public.shaders
    set
      source = p_source,
      kind = p_kind,
      parameter_values = coalesce(p_parameter_values, '{}'::jsonb),
      features = coalesce(p_features, '{}'::jsonb),
      composition = coalesce(p_composition, '{}'::jsonb),
      input_path = v_input_path,
      input_name = v_input_name,
      input_mime_type = v_input_mime_type,
      dependency_snapshots = v_dependency_snapshots,
      state_revision = state_revision + 1
    where id = p_shader_id
    returning * into v_shader;
  end if;

  if p_checkpoint_kind is not null then
    if p_checkpoint_kind not in (
      'manual',
      'publish',
      'agent',
      'before_restore'
    ) then
      raise exception 'invalid_checkpoint_kind' using errcode = '22023';
    end if;

    v_checkpoint_dependency_snapshots := v_shader.dependency_snapshots;

    select *
    into v_latest
    from public.shader_versions
    where shader_id = p_shader_id
    order by version_number desc
    limit 1;

    if v_latest.id is null
      or v_latest.source is distinct from v_shader.source
      or v_latest.kind is distinct from v_shader.kind
      or v_latest.parameter_values is distinct from v_shader.parameter_values
      or v_latest.features is distinct from v_shader.features
      or v_latest.composition is distinct from v_shader.composition
      or v_latest.input_path is distinct from v_shader.input_path
      or v_latest.input_name is distinct from v_shader.input_name
      or v_latest.input_mime_type is distinct from v_shader.input_mime_type
      or v_latest.dependency_snapshots
        is distinct from v_checkpoint_dependency_snapshots then
      select coalesce(max(version_number), 0) + 1
      into v_next_version
      from public.shader_versions
      where shader_id = p_shader_id;

      insert into public.shader_versions (
        shader_id,
        version_number,
        state_revision,
        checkpoint_kind,
        summary,
        source,
        kind,
        parameter_values,
        features,
        composition,
        input_path,
        input_name,
        input_mime_type,
        dependency_snapshots,
        created_by
      )
      values (
        v_shader.id,
        v_next_version,
        v_shader.state_revision,
        p_checkpoint_kind,
        left(coalesce(nullif(trim(p_summary), ''), 'Saved version'), 500),
        v_shader.source,
        v_shader.kind,
        v_shader.parameter_values,
        v_shader.features,
        v_shader.composition,
        v_shader.input_path,
        v_shader.input_name,
        v_shader.input_mime_type,
        v_checkpoint_dependency_snapshots,
        (select auth.uid())
      );
    end if;

    if v_shader.versioned_state_revision <> v_shader.state_revision then
      update public.shaders
      set versioned_state_revision = state_revision
      where id = p_shader_id
      returning * into v_shader;
    end if;
  end if;

  return v_shader;
end;
$$;

create or replace function public.restore_shader_version(
  p_shader_id uuid,
  p_version_id uuid,
  p_expected_state_revision bigint
)
returns public.shaders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shader public.shaders;
  v_target public.shader_versions;
  v_latest public.shader_versions;
  v_next_version bigint;
begin
  perform set_config('lock_timeout', '5000', true);

  select *
  into v_shader
  from public.shaders
  where id = p_shader_id
  for update;

  if not found
    or v_shader.owner_id is distinct from (select auth.uid()) then
    raise exception 'shader_not_found' using errcode = 'P0002';
  end if;

  if p_expected_state_revision is not null
    and v_shader.state_revision <> p_expected_state_revision then
    raise exception 'shader_state_conflict' using errcode = '40001';
  end if;

  select *
  into v_target
  from public.shader_versions
  where id = p_version_id
    and shader_id = p_shader_id;

  if not found then
    raise exception 'shader_version_not_found' using errcode = 'P0002';
  end if;
  if v_target.snapshot_schema_version is distinct from 2 then
    raise exception 'shader_version_incomplete' using errcode = '22023';
  end if;

  select coalesce(max(version_number), 0) + 1
  into v_next_version
  from public.shader_versions
  where shader_id = p_shader_id;

  if v_shader.state_revision <> v_shader.versioned_state_revision then
    select *
    into v_latest
    from public.shader_versions
    where shader_id = p_shader_id
    order by version_number desc
    limit 1;

    if v_latest.id is null
      or v_latest.source is distinct from v_shader.source
      or v_latest.kind is distinct from v_shader.kind
      or v_latest.parameter_values is distinct from v_shader.parameter_values
      or v_latest.features is distinct from v_shader.features
      or v_latest.composition is distinct from v_shader.composition
      or v_latest.input_path is distinct from v_shader.input_path
      or v_latest.input_name is distinct from v_shader.input_name
      or v_latest.input_mime_type is distinct from v_shader.input_mime_type
      or v_latest.dependency_snapshots
        is distinct from v_shader.dependency_snapshots then
      insert into public.shader_versions (
        shader_id,
        version_number,
        state_revision,
        checkpoint_kind,
        summary,
        source,
        kind,
        parameter_values,
        features,
        composition,
        input_path,
        input_name,
        input_mime_type,
        dependency_snapshots,
        created_by
      )
      values (
        v_shader.id,
        v_next_version,
        v_shader.state_revision,
        'before_restore',
        'Before restoring Version ' || v_target.version_number,
        v_shader.source,
        v_shader.kind,
        v_shader.parameter_values,
        v_shader.features,
        v_shader.composition,
        v_shader.input_path,
        v_shader.input_name,
        v_shader.input_mime_type,
        v_shader.dependency_snapshots,
        (select auth.uid())
      );
      v_next_version := v_next_version + 1;
    end if;
  end if;

  -- Restore only visual state. Name, description, visibility, thumbnail, and
  -- Figma linkage remain the current shader metadata.
  update public.shaders
  set
    source = v_target.source,
    kind = v_target.kind,
    parameter_values = v_target.parameter_values,
    features = v_target.features,
    composition = v_target.composition,
    input_path = v_target.input_path,
    input_name = v_target.input_name,
    input_mime_type = v_target.input_mime_type,
    dependency_snapshots = v_target.dependency_snapshots,
    state_revision = state_revision + 1
  where id = p_shader_id
  returning * into v_shader;

  insert into public.shader_versions (
    shader_id,
    version_number,
    state_revision,
    checkpoint_kind,
    summary,
    source,
    kind,
    parameter_values,
    features,
    composition,
    input_path,
    input_name,
    input_mime_type,
    dependency_snapshots,
    created_by,
    restored_from_version_id
  )
  values (
    v_shader.id,
    v_next_version,
    v_shader.state_revision,
    'restore',
    'Restored Version ' || v_target.version_number,
    v_shader.source,
    v_shader.kind,
    v_shader.parameter_values,
    v_shader.features,
    v_shader.composition,
    v_shader.input_path,
    v_shader.input_name,
    v_shader.input_mime_type,
    v_shader.dependency_snapshots,
    (select auth.uid()),
    v_target.id
  );

  update public.shaders
  set versioned_state_revision = state_revision
  where id = p_shader_id
  returning * into v_shader;

  return v_shader;
end;
$$;

revoke all on function public.save_shader_state(
  uuid,
  bigint,
  text,
  text,
  jsonb,
  jsonb,
  text,
  text,
  jsonb,
  text,
  text,
  text,
  jsonb,
  jsonb,
  boolean
) from public;
revoke all on function public.save_shader_state(
  uuid,
  bigint,
  text,
  text,
  jsonb,
  jsonb,
  text,
  text,
  jsonb,
  text,
  text,
  text,
  jsonb,
  jsonb,
  boolean
) from anon;
grant execute on function public.save_shader_state(
  uuid,
  bigint,
  text,
  text,
  jsonb,
  jsonb,
  text,
  text,
  jsonb,
  text,
  text,
  text,
  jsonb,
  jsonb,
  boolean
) to authenticated;

revoke all on function public.restore_shader_version(uuid, uuid, bigint)
  from public;
revoke all on function public.restore_shader_version(uuid, uuid, bigint)
  from anon;
grant execute on function public.restore_shader_version(uuid, uuid, bigint)
  to authenticated;

-- New documents allocate their UUID before the row insert so immutable media
-- can be uploaded first and the initial version can reference durable paths.
drop policy if exists "Owners can upload shader assets" on storage.objects;
create policy "Owners can upload shader assets"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'shader-assets'
  and (storage.foldername(storage.objects.name))[1] =
    (select auth.uid())::text
  and storage.objects.name ~ (
    '^'
    || (select auth.uid())::text
    || '/[0-9a-f-]{36}/assets/[A-Za-z0-9_-]+-[0-9a-f]{64}\.[a-z0-9]+$'
  )
);

create or replace function public.shader_snapshot_asset_paths(
  p_snapshot jsonb
)
returns table(path text)
language sql
immutable
security invoker
set search_path = ''
as $$
  select distinct value #>> '{}' as path
  from (
    select jsonb_path_query(
      coalesce(p_snapshot, '{}'::jsonb),
      'lax $.**.assetPath'
    ) as value
    union all
    select jsonb_path_query(
      coalesce(p_snapshot, '{}'::jsonb),
      'lax $.**.input_path'
    ) as value
  ) as paths
  where jsonb_typeof(value) = 'string'
    and value #>> '{}' <> '';
$$;

-- Storage authorization must never trust client-writable JSON directly.
-- This registry is maintained by trusted triggers after validating that the
-- parent owner could read each referenced asset at the time it was attached.
create table if not exists public.shader_asset_references (
  parent_shader_id uuid not null
    references public.shaders(id) on delete cascade,
  reference_kind text not null
    check (reference_kind in ('live', 'version')),
  reference_id uuid not null,
  asset_path text not null,
  created_at timestamptz not null default now(),
  primary key (reference_kind, reference_id, asset_path)
);

create index if not exists shader_asset_references_path_idx
  on public.shader_asset_references (asset_path);
create index if not exists shader_asset_references_parent_idx
  on public.shader_asset_references (parent_shader_id);

alter table public.shader_asset_references enable row level security;
revoke all on table public.shader_asset_references from public;
revoke all on table public.shader_asset_references from anon;
revoke all on table public.shader_asset_references from authenticated;

create or replace function public.shader_asset_reference_is_valid(
  p_parent_shader_id uuid,
  p_asset_path text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.shaders as parent
    where parent.id = p_parent_shader_id
      and (
        split_part(p_asset_path, '/', 1) = parent.owner_id::text
        or exists (
          select 1
          from public.shaders as source
          where source.id::text = split_part(p_asset_path, '/', 2)
            and source.owner_id::text = split_part(p_asset_path, '/', 1)
            and (
              source.owner_id = parent.owner_id
              or source.is_public
            )
        )
        or exists (
          select 1
          from public.shader_asset_references as existing
          where existing.parent_shader_id = parent.id
            and existing.asset_path = p_asset_path
        )
      )
  );
$$;

revoke all on function public.shader_asset_reference_is_valid(uuid, text)
  from public;
revoke all on function public.shader_asset_reference_is_valid(uuid, text)
  from anon;
revoke all on function public.shader_asset_reference_is_valid(uuid, text)
  from authenticated;

create or replace function public.sync_shader_asset_references()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent_shader_id uuid;
  v_reference_kind text;
  v_reference_id uuid;
  v_snapshot jsonb;
  v_invalid_path text;
begin
  if tg_table_name = 'shaders' then
    v_parent_shader_id := new.id;
    v_reference_kind := 'live';
    v_reference_id := new.id;
  else
    v_parent_shader_id := new.shader_id;
    v_reference_kind := 'version';
    v_reference_id := new.id;
  end if;

  v_snapshot := jsonb_build_object(
    'composition', new.composition,
    'input_path', new.input_path,
    'dependency_snapshots', new.dependency_snapshots
  );

  select paths.path
  into v_invalid_path
  from public.shader_snapshot_asset_paths(v_snapshot) as paths
  where not public.shader_asset_reference_is_valid(
    v_parent_shader_id,
    paths.path
  )
  limit 1;

  if v_invalid_path is not null then
    raise exception 'invalid_shader_asset_reference'
      using errcode = '42501';
  end if;

  delete from public.shader_asset_references
  where reference_kind = v_reference_kind
    and reference_id = v_reference_id;

  insert into public.shader_asset_references (
    parent_shader_id,
    reference_kind,
    reference_id,
    asset_path
  )
  select
    v_parent_shader_id,
    v_reference_kind,
    v_reference_id,
    paths.path
  from public.shader_snapshot_asset_paths(v_snapshot) as paths
  on conflict do nothing;

  return new;
end;
$$;

create or replace function public.remove_shader_version_asset_references()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.shader_asset_references
  where reference_kind = 'version'
    and reference_id = old.id;
  return old;
end;
$$;

drop trigger if exists shaders_sync_asset_references on public.shaders;
create trigger shaders_sync_asset_references
after insert or update of composition, input_path, dependency_snapshots
on public.shaders
for each row execute function public.sync_shader_asset_references();

drop trigger if exists shader_versions_sync_asset_references
  on public.shader_versions;
create trigger shader_versions_sync_asset_references
after insert or update of composition, input_path, dependency_snapshots
on public.shader_versions
for each row execute function public.sync_shader_asset_references();

drop trigger if exists shader_versions_remove_asset_references
  on public.shader_versions;
create trigger shader_versions_remove_asset_references
after delete on public.shader_versions
for each row execute function public.remove_shader_version_asset_references();

-- Register existing complete live/version snapshots conservatively. Invalid
-- legacy cross-owner paths remain inaccessible instead of becoming ACL data.
insert into public.shader_asset_references (
  parent_shader_id,
  reference_kind,
  reference_id,
  asset_path
)
select
  shaders.id,
  'live',
  shaders.id,
  paths.path
from public.shaders as shaders
cross join lateral public.shader_snapshot_asset_paths(
  jsonb_build_object(
    'composition', shaders.composition,
    'input_path', shaders.input_path,
    'dependency_snapshots', shaders.dependency_snapshots
  )
) as paths
where public.shader_asset_reference_is_valid(shaders.id, paths.path)
on conflict do nothing;

insert into public.shader_asset_references (
  parent_shader_id,
  reference_kind,
  reference_id,
  asset_path
)
select
  versions.shader_id,
  'version',
  versions.id,
  paths.path
from public.shader_versions as versions
cross join lateral public.shader_snapshot_asset_paths(
  jsonb_build_object(
    'composition', versions.composition,
    'input_path', versions.input_path,
    'dependency_snapshots', versions.dependency_snapshots
  )
) as paths
where versions.snapshot_schema_version = 2
  and public.shader_asset_reference_is_valid(
    versions.shader_id,
    paths.path
  )
on conflict do nothing;

create or replace function public.can_read_shader_asset(p_asset_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.shaders as source
      where source.id::text = split_part(p_asset_path, '/', 2)
        and source.owner_id::text = split_part(p_asset_path, '/', 1)
        and (
          source.is_public
          or source.owner_id = (select auth.uid())
        )
    )
    or exists (
      select 1
      from public.shader_asset_references as asset_refs
      join public.shaders as parent
        on parent.id = asset_refs.parent_shader_id
      where asset_refs.asset_path = p_asset_path
        and (
          parent.is_public
          or parent.owner_id = (select auth.uid())
        )
    );
$$;

revoke all on function public.can_read_shader_asset(text) from public;
grant execute on function public.can_read_shader_asset(text)
  to anon, authenticated;

create or replace function public.shader_asset_is_referenced(
  p_asset_path text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.shader_asset_references as asset_refs
    where asset_refs.asset_path = p_asset_path
  );
$$;

revoke all on function public.shader_asset_is_referenced(text) from public;
revoke all on function public.shader_asset_is_referenced(text) from anon;
grant execute on function public.shader_asset_is_referenced(text)
  to authenticated;

create or replace function public.retained_shader_asset_paths(
  p_shader_id uuid
)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid;
  v_prefix text;
  v_paths text[];
begin
  select owner_id
  into v_owner_id
  from public.shaders
  where id = p_shader_id;

  if not found or v_owner_id is distinct from (select auth.uid()) then
    raise exception 'shader_not_found' using errcode = 'P0002';
  end if;

  v_prefix := v_owner_id::text || '/' || p_shader_id::text || '/%';
  select coalesce(array_agg(distinct retained.path), array[]::text[])
  into v_paths
  from (
    select asset_refs.asset_path as path
    from public.shader_asset_references as asset_refs
    where asset_refs.parent_shader_id <> p_shader_id
      and asset_refs.asset_path like v_prefix
  ) as retained;

  return v_paths;
end;
$$;

revoke all on function public.retained_shader_asset_paths(uuid) from public;
revoke all on function public.retained_shader_asset_paths(uuid) from anon;
grant execute on function public.retained_shader_asset_paths(uuid)
  to authenticated;

-- Retained immutable assets remain readable through any public or owned
-- document/version that pins them, even after the source shader is deleted.
drop policy if exists "Shader assets follow shader visibility" on storage.objects;
create policy "Shader assets follow shader visibility"
on storage.objects for select
using (
  bucket_id = 'shader-assets'
  and public.can_read_shader_asset(storage.objects.name)
);

-- Content-addressed assets are immutable. Deletion is allowed only after all
-- live and historical references have disappeared.
drop policy if exists "Owners can update shader assets" on storage.objects;
drop policy if exists "Owners can delete shader assets" on storage.objects;
create policy "Owners can delete unreferenced shader assets"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'shader-assets'
  and (storage.foldername(storage.objects.name))[1] =
    (select auth.uid())::text
  and not public.shader_asset_is_referenced(storage.objects.name)
);

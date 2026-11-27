-- Published graph membership and references are maintained for every write,
-- including older clients that use direct table updates.
create table public.published_shader_nodes (
  shader_id uuid primary key references public.shaders(id) on delete cascade
);

create table public.published_shader_refs (
  parent_id uuid not null references public.published_shader_nodes(shader_id) on delete cascade,
  target_id uuid not null,
  primary key (parent_id, target_id),
  constraint published_shader_target_required
    foreign key (target_id) references public.published_shader_nodes(shader_id)
    deferrable initially deferred
);

create index published_shader_refs_target_idx on public.published_shader_refs (target_id);

alter table public.published_shader_nodes enable row level security;
alter table public.published_shader_refs enable row level security;
revoke all on public.published_shader_nodes, public.published_shader_refs from anon, authenticated;

create function public.shader_reference_keys(p_kind text, p_graph jsonb)
returns table (ref text)
language sql
immutable
set search_path = ''
as $$
  with layers as (
    select jsonb_array_elements(
      case
        when p_kind = 'composition' and jsonb_typeof(p_graph->'fills') = 'array'
          then p_graph->'fills'
        when p_kind = 'composition' and jsonb_typeof(p_graph->'fill') = 'object'
          then jsonb_build_array(p_graph->'fill')
        when p_kind = 'effect' and jsonb_typeof(p_graph->'effectFills') = 'array'
          then p_graph->'effectFills'
        when p_kind = 'effect' and jsonb_typeof(p_graph->'effectFill') = 'object'
          then jsonb_build_array(p_graph->'effectFill')
        else '[]'::jsonb
      end
    ) as layer, true as is_fill
    union all
    select jsonb_array_elements(
      case when p_kind = 'composition' and jsonb_typeof(p_graph->'effects') = 'array'
        then p_graph->'effects' else '[]'::jsonb end
    ), false
  )
  select distinct regexp_replace(layer->>'shaderId', '^(cloud:|draft:)', '')
  from layers
  where jsonb_typeof(layer->'shaderId') = 'string'
    and layer->>'shaderId' <> ''
    and (not is_fill or layer->>'type' = 'shader');
$$;

insert into public.published_shader_nodes (shader_id)
select id from public.shaders where is_public;

-- Existing publications may contain historic references to deleted rows.
-- Backfill their valid edges without changing their visibility.
insert into public.published_shader_refs (parent_id, target_id)
select distinct shader.id, node.shader_id
from public.shaders as shader
cross join lateral public.shader_reference_keys(shader.kind, shader.composition) as dependency
join public.published_shader_nodes as node on node.shader_id::text = lower(dependency.ref)
where shader.is_public and node.shader_id <> shader.id;

create function public.sync_published_shader_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if old.is_public = new.is_public and old.kind = new.kind
      and old.composition is not distinct from new.composition then
      return new;
    end if;
  end if;

  if not new.is_public then
    delete from public.published_shader_nodes where shader_id = new.id;
    return new;
  end if;

  if exists (
    select 1 from public.shader_reference_keys(new.kind, new.composition)
    where ref !~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'
      or lower(ref) = new.id::text
  ) then
    raise exception 'invalid_published_shader_reference' using errcode = '23514';
  end if;

  insert into public.published_shader_nodes (shader_id) values (new.id)
    on conflict do nothing;
  delete from public.published_shader_refs where parent_id = new.id;
  insert into public.published_shader_refs (parent_id, target_id)
  select distinct new.id, ref::uuid
  from public.shader_reference_keys(new.kind, new.composition);
  return new;
end;
$$;

create trigger shaders_sync_published_refs
after insert or update of is_public, kind, composition on public.shaders
for each row execute function public.sync_published_shader_refs();

create table public.shader_plan_builds (
  shader_id uuid not null references public.shaders(id) on delete cascade,
  plan_revision text not null check (plan_revision ~ '^[0-9a-f]{64}$'),
  lease_id uuid not null,
  expires_at timestamptz not null,
  built_state_revision bigint,
  primary key (shader_id, plan_revision)
);

alter table public.shader_plan_builds enable row level security;
revoke all on public.shader_plan_builds from anon, authenticated;

create function public.shader_plan_build_status(p_shader_id uuid, p_plan_revision text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case when build.built_state_revision is not null then 'built'
                when build.expires_at > now() then 'building'
                else 'ready' end
    from public.shader_plan_builds as build
    join public.shaders as shader on shader.id = build.shader_id
    where build.shader_id = p_shader_id and build.plan_revision = p_plan_revision
      and shader.owner_id = (select auth.uid())
  ), 'unknown');
$$;

create function public.claim_shader_plan_build(p_shader_id uuid, p_plan_revision text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lease_id uuid;
begin
  perform 1 from public.shaders
  where id = p_shader_id and owner_id = (select auth.uid()) for key share;
  if not found then
    raise exception 'shader_not_found' using errcode = 'P0002';
  end if;

  insert into public.shader_plan_builds as build (shader_id, plan_revision, lease_id, expires_at)
  values (p_shader_id, p_plan_revision, gen_random_uuid(), now() + interval '45 minutes')
  on conflict (shader_id, plan_revision) do update
  set lease_id = excluded.lease_id, expires_at = excluded.expires_at
  where build.built_state_revision is null and build.expires_at <= now()
  returning lease_id into v_lease_id;

  return case when v_lease_id is not null
    then jsonb_build_object('status', 'claimed', 'leaseId', v_lease_id)
    else jsonb_build_object('status', public.shader_plan_build_status(p_shader_id, p_plan_revision))
  end;
end;
$$;

create function public.release_shader_plan_build(p_shader_id uuid, p_plan_revision text, p_lease_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.shader_plan_builds as build set expires_at = now()
  from public.shaders as shader
  where shader.id = build.shader_id and shader.owner_id = (select auth.uid())
    and build.shader_id = p_shader_id and build.plan_revision = p_plan_revision
    and build.lease_id = p_lease_id and build.built_state_revision is null;
$$;

alter table public.shader_versions
  add column shader_name text,
  add column shader_description text,
  add column shader_is_public boolean;

create function public.snapshot_shader_version_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select name, description, is_public
  into new.shader_name, new.shader_description, new.shader_is_public
  from public.shaders where id = new.shader_id;
  return new;
end;
$$;

create trigger shader_versions_snapshot_metadata
before insert on public.shader_versions
for each row execute function public.snapshot_shader_version_metadata();

-- Keep the existing RPC available for old clients. The editor uses this
-- transaction for visual state, metadata, checkpoint, and optional plan receipt.
create function public.commit_shader_document(
  p_document jsonb,
  p_metadata jsonb default '{}'::jsonb,
  p_create boolean default false,
  p_expected_updated_at timestamptz default null,
  p_publish_dependencies uuid[] default '{}',
  p_plan_revision text default null,
  p_plan_lease_id uuid default null
)
returns public.shaders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := (p_document->>'p_shader_id')::uuid;
  v_expected_revision bigint := (p_document->>'p_expected_state_revision')::bigint;
  v_owner uuid := (select auth.uid());
  v_shader public.shaders;
  v_metadata public.shaders;
  v_build public.shader_plan_builds;
  v_checkpoint text := p_document->>'p_checkpoint_kind';
  v_dependency uuid;
begin
  perform set_config('lock_timeout', '5000', true);
  if v_owner is null or v_id is null or jsonb_typeof(p_document) is distinct from 'object'
    or jsonb_typeof(p_metadata) is distinct from 'object' then
    raise exception 'invalid_shader_commit' using errcode = '22023';
  end if;

  if cardinality(p_publish_dependencies) > 0 then
    if (p_metadata->>'is_public')::boolean is distinct from true then
      raise exception 'invalid_shader_publication' using errcode = '22023';
    end if;
    -- Publish only the explicitly requested, owned dependencies of this document.
    for v_dependency in
      select distinct dependency from unnest(p_publish_dependencies) as requested(dependency)
      order by dependency
    loop
      if v_dependency = v_id or not exists (
        select 1 from public.shader_reference_keys(
          p_document->>'p_kind', p_document->'p_composition'
        ) where lower(ref) = v_dependency::text
      ) then
        raise exception 'invalid_published_shader_reference' using errcode = '23514';
      end if;
      perform 1 from public.shaders where id = v_dependency
        and (is_public or owner_id = v_owner) for update;
      if not found then
        raise exception 'referenced_shader_unavailable' using errcode = '23514';
      end if;
      update public.shaders set is_public = true
      where id = v_dependency and owner_id = v_owner and not is_public;
    end loop;
  end if;

  select * into v_shader from public.shaders where id = v_id for update;
  if not found then
    if not p_create or p_plan_revision is not null then
      raise exception 'shader_not_found' using errcode = 'P0002';
    end if;
    v_metadata := jsonb_populate_record(null::public.shaders, p_metadata);
    insert into public.shaders (
      id, owner_id, name, description, source, kind, parameter_values, features,
      composition, input_path, input_name, input_mime_type, dependency_snapshots,
      is_public, thumbnail_path, thumbnail_small_path, thumbnail_bucket,
      figma_shader_id, figma_shader_kind, figma_shader_version
    ) values (
      v_id, v_owner, v_metadata.name, v_metadata.description, p_document->>'p_source',
      p_document->>'p_kind', coalesce(p_document->'p_parameter_values', '{}'::jsonb),
      coalesce(p_document->'p_features', '{}'::jsonb), coalesce(p_document->'p_composition', '{}'::jsonb),
      p_document->>'p_input_path', p_document->>'p_input_name', p_document->>'p_input_mime_type',
      coalesce(nullif(p_document->'p_dependency_snapshots', 'null'::jsonb), '{}'::jsonb),
      coalesce(v_metadata.is_public, false), v_metadata.thumbnail_path,
      v_metadata.thumbnail_small_path, coalesce(v_metadata.thumbnail_bucket, 'shader-assets'),
      v_metadata.figma_shader_id, v_metadata.figma_shader_kind, v_metadata.figma_shader_version
    ) returning * into v_shader;
    return v_shader;
  end if;

  if v_shader.owner_id is distinct from v_owner then
    raise exception 'shader_not_found' using errcode = 'P0002';
  end if;

  if (p_plan_revision is null) <> (p_plan_lease_id is null) then
    raise exception 'invalid_plan_build_receipt' using errcode = '22023';
  end if;

  if p_plan_revision is not null then
    select * into v_build from public.shader_plan_builds
    where shader_id = v_id and plan_revision = p_plan_revision for update;
    if not found or v_build.lease_id is distinct from p_plan_lease_id
      or v_checkpoint is distinct from 'agent' then
      raise exception 'shader_plan_build_lease_lost' using errcode = 'P0001';
    end if;
    if v_build.built_state_revision is not null then
      if v_build.built_state_revision = v_shader.state_revision
        and v_shader.source is not distinct from p_document->>'p_source' then
        return v_shader;
      end if;
      raise exception 'shader_state_conflict' using errcode = '40001';
    end if;
    if v_build.expires_at <= now() then
      raise exception 'shader_plan_build_lease_lost' using errcode = 'P0001';
    end if;
  end if;

  if v_expected_revision is null or v_shader.state_revision <> v_expected_revision
    or (p_expected_updated_at is not null and v_shader.updated_at <> p_expected_updated_at) then
    raise exception 'shader_state_conflict' using errcode = '40001';
  end if;

  v_metadata := jsonb_populate_record(v_shader, p_metadata);
  -- Write state first when publishing, so the public reference trigger sees
  -- the new graph when visibility changes. Version metadata is captured below.
  v_shader := public.save_shader_state(
    v_id, v_shader.state_revision, p_document->>'p_source', p_document->>'p_kind',
    p_document->'p_parameter_values', p_document->'p_features', null, null,
    p_document->'p_composition', p_document->>'p_input_path',
    p_document->>'p_input_name', p_document->>'p_input_mime_type',
    coalesce(
      case when v_checkpoint is not null then nullif(p_document->'p_checkpoint_dependency_snapshots', 'null'::jsonb) end,
      nullif(p_document->'p_dependency_snapshots', 'null'::jsonb)
    ),
    null, coalesce((p_document->>'p_input_fields_present')::boolean, false)
  );

  if row(v_metadata.name, v_metadata.description, v_metadata.is_public,
    v_metadata.thumbnail_path, v_metadata.thumbnail_small_path, v_metadata.thumbnail_bucket,
    v_metadata.figma_shader_id, v_metadata.figma_shader_kind, v_metadata.figma_shader_version)
    is distinct from row(v_shader.name, v_shader.description, v_shader.is_public,
    v_shader.thumbnail_path, v_shader.thumbnail_small_path, v_shader.thumbnail_bucket,
    v_shader.figma_shader_id, v_shader.figma_shader_kind, v_shader.figma_shader_version) then
    update public.shaders set
      name = v_metadata.name, description = v_metadata.description,
      is_public = v_metadata.is_public, thumbnail_path = v_metadata.thumbnail_path,
      thumbnail_small_path = v_metadata.thumbnail_small_path, thumbnail_bucket = v_metadata.thumbnail_bucket,
      figma_shader_id = v_metadata.figma_shader_id, figma_shader_kind = v_metadata.figma_shader_kind,
      figma_shader_version = v_metadata.figma_shader_version,
      state_revision = state_revision + case when
        row(name, description, is_public) is distinct from
        row(v_metadata.name, v_metadata.description, v_metadata.is_public)
        then 1 else 0 end
    where id = v_id returning * into v_shader;
  end if;

  if v_checkpoint is not null then
    if v_checkpoint not in ('manual', 'publish', 'agent', 'before_restore') then
      raise exception 'invalid_checkpoint_kind' using errcode = '22023';
    end if;
    insert into public.shader_versions (
      shader_id, version_number, state_revision, checkpoint_kind, summary,
      source, kind, parameter_values, features, composition,
      input_path, input_name, input_mime_type, dependency_snapshots, created_by
    )
    select
      v_id, (select coalesce(max(version_number), 0) + 1 from public.shader_versions where shader_id = v_id),
      v_shader.state_revision, v_checkpoint,
      left(coalesce(nullif(trim(p_document->>'p_summary'), ''), 'Saved version'), 500),
      v_shader.source, v_shader.kind, v_shader.parameter_values, v_shader.features,
      v_shader.composition, v_shader.input_path, v_shader.input_name,
      v_shader.input_mime_type, v_shader.dependency_snapshots, v_owner
    where not exists (
      select 1 from public.shader_versions
      where shader_id = v_id and state_revision = v_shader.state_revision
        and shader_name is not distinct from v_shader.name
        and shader_description is not distinct from v_shader.description
        and shader_is_public is not distinct from v_shader.is_public
    );
    if v_shader.versioned_state_revision <> v_shader.state_revision then
      update public.shaders set versioned_state_revision = state_revision
      where id = v_id returning * into v_shader;
    end if;
  end if;

  if p_plan_revision is not null then
    update public.shader_plan_builds set built_state_revision = v_shader.state_revision
    where shader_id = v_id and plan_revision = p_plan_revision;
  end if;
  return v_shader;
end;
$$;

revoke execute on function public.sync_published_shader_refs(), public.snapshot_shader_version_metadata()
from public, anon, authenticated;
revoke execute on function public.shader_plan_build_status(uuid, text),
  public.claim_shader_plan_build(uuid, text), public.release_shader_plan_build(uuid, text, uuid),
  public.commit_shader_document(jsonb, jsonb, boolean, timestamptz, uuid[], text, uuid)
from public, anon;
grant execute on function public.shader_plan_build_status(uuid, text),
  public.claim_shader_plan_build(uuid, text), public.release_shader_plan_build(uuid, text, uuid),
  public.commit_shader_document(jsonb, jsonb, boolean, timestamptz, uuid[], text, uuid)
to authenticated;

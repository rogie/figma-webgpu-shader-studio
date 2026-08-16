alter table public.shaders
  add column if not exists state_revision bigint not null default 1,
  add column if not exists versioned_state_revision bigint not null default 1;

create table if not exists public.shader_versions (
  id uuid primary key default gen_random_uuid(),
  shader_id uuid not null references public.shaders(id) on delete cascade,
  version_number bigint not null check (version_number > 0),
  state_revision bigint not null check (state_revision > 0),
  checkpoint_kind text not null check (
    checkpoint_kind in (
      'initial',
      'manual',
      'publish',
      'agent',
      'before_restore',
      'restore'
    )
  ),
  summary text not null check (
    char_length(summary) between 1 and 500
  ),
  source text not null,
  kind text not null check (kind in ('effect', 'fill')),
  parameter_values jsonb not null default '{}'::jsonb,
  features jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id),
  restored_from_version_id uuid references public.shader_versions(id),
  created_at timestamptz not null default now(),
  unique (shader_id, version_number)
);

create index if not exists shader_versions_shader_version_idx
  on public.shader_versions (shader_id, version_number desc);

alter table public.shader_versions enable row level security;

revoke all on table public.shader_versions from anon;
revoke insert, update, delete on table public.shader_versions
  from authenticated;
grant select on table public.shader_versions to authenticated;

drop policy if exists "Owners can read shader versions"
  on public.shader_versions;
create policy "Owners can read shader versions"
on public.shader_versions for select
to authenticated
using (
  exists (
    select 1
    from public.shaders
    where shaders.id = shader_versions.shader_id
      and shaders.owner_id = (select auth.uid())
  )
);

create or replace function public.normalize_shader_revision_on_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.state_revision := 1;
  new.versioned_state_revision := 1;
  return new;
end;
$$;

drop trigger if exists shaders_normalize_revision_on_insert on public.shaders;
create trigger shaders_normalize_revision_on_insert
before insert on public.shaders
for each row execute function public.normalize_shader_revision_on_insert();

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
    or old.features is distinct from new.features;

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

drop trigger if exists shaders_track_state_revision on public.shaders;
create trigger shaders_track_state_revision
before update on public.shaders
for each row execute function public.track_shader_state_revision();

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
  created_by,
  created_at
)
select
  shaders.id,
  1,
  shaders.state_revision,
  'initial',
  'Initial saved version',
  shaders.source,
  shaders.kind,
  shaders.parameter_values,
  shaders.features,
  shaders.owner_id,
  shaders.created_at
from public.shaders
on conflict (shader_id, version_number) do nothing;

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
    new.owner_id,
    new.created_at
  )
  on conflict (shader_id, version_number) do nothing;
  return new;
end;
$$;

drop trigger if exists shaders_seed_initial_version on public.shaders;
create trigger shaders_seed_initial_version
after insert on public.shaders
for each row execute function public.seed_initial_shader_version();

create or replace function public.save_shader_state(
  p_shader_id uuid,
  p_expected_state_revision bigint,
  p_source text,
  p_kind text,
  p_parameter_values jsonb,
  p_features jsonb,
  p_checkpoint_kind text default null,
  p_summary text default null
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
begin
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

  if p_kind not in ('effect', 'fill') then
    raise exception 'invalid_shader_kind' using errcode = '22023';
  end if;

  v_changed :=
    v_shader.source is distinct from p_source
    or v_shader.kind is distinct from p_kind
    or v_shader.parameter_values is distinct from coalesce(
      p_parameter_values,
      '{}'::jsonb
    )
    or v_shader.features is distinct from coalesce(p_features, '{}'::jsonb);

  if v_changed then
    update public.shaders
    set
      source = p_source,
      kind = p_kind,
      parameter_values = coalesce(p_parameter_values, '{}'::jsonb),
      features = coalesce(p_features, '{}'::jsonb),
      state_revision = state_revision + 1
    where id = p_shader_id
    returning * into v_shader;
  end if;

  if p_checkpoint_kind is not null then
    if p_checkpoint_kind not in ('manual', 'publish', 'agent') then
      raise exception 'invalid_checkpoint_kind' using errcode = '22023';
    end if;

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
      or v_latest.features is distinct from v_shader.features then
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
  v_next_version bigint;
begin
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

  select coalesce(max(version_number), 0) + 1
  into v_next_version
  from public.shader_versions
  where shader_id = p_shader_id;

  if v_shader.state_revision <> v_shader.versioned_state_revision then
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
      (select auth.uid())
    );
    v_next_version := v_next_version + 1;
  end if;

  update public.shaders
  set
    source = v_target.source,
    kind = v_target.kind,
    parameter_values = v_target.parameter_values,
    features = v_target.features,
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
  text
) from public;
revoke all on function public.save_shader_state(
  uuid,
  bigint,
  text,
  text,
  jsonb,
  jsonb,
  text,
  text
) from anon;
grant execute on function public.save_shader_state(
  uuid,
  bigint,
  text,
  text,
  jsonb,
  jsonb,
  text,
  text
) to authenticated;

revoke all on function public.restore_shader_version(uuid, uuid, bigint)
  from public;
revoke all on function public.restore_shader_version(uuid, uuid, bigint)
  from anon;
grant execute on function public.restore_shader_version(uuid, uuid, bigint)
  to authenticated;

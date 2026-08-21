-- Compositions: third shader kind with a live-referenced fill + effect graph.

do $$
declare
  cname text;
begin
  select con.conname
  into cname
  from pg_constraint con
  join pg_attribute att
    on att.attrelid = con.conrelid
   and att.attnum = con.conkey[1]
  where con.conrelid = 'public.shaders'::regclass
    and con.contype = 'c'
    and att.attname = 'kind'
  limit 1;
  if cname is not null then
    execute format('alter table public.shaders drop constraint %I', cname);
  end if;
end $$;

alter table public.shaders
  add constraint shaders_kind_check
  check (kind in ('effect', 'fill', 'composition'));

alter table public.shaders
  add column if not exists composition jsonb not null default '{}'::jsonb;

do $$
declare
  cname text;
begin
  select con.conname
  into cname
  from pg_constraint con
  join pg_attribute att
    on att.attrelid = con.conrelid
   and att.attnum = con.conkey[1]
  where con.conrelid = 'public.shader_versions'::regclass
    and con.contype = 'c'
    and att.attname = 'kind'
  limit 1;
  if cname is not null then
    execute format(
      'alter table public.shader_versions drop constraint %I',
      cname
    );
  end if;
end $$;

alter table public.shader_versions
  add constraint shader_versions_kind_check
  check (kind in ('effect', 'fill', 'composition'));

alter table public.shader_versions
  add column if not exists composition jsonb not null default '{}'::jsonb;

drop function if exists public.save_shader_state(
  uuid,
  bigint,
  text,
  text,
  jsonb,
  jsonb,
  text,
  text
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
  p_composition jsonb default '{}'::jsonb
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
    );

  if v_changed then
    update public.shaders
    set
      source = p_source,
      kind = p_kind,
      parameter_values = coalesce(p_parameter_values, '{}'::jsonb),
      features = coalesce(p_features, '{}'::jsonb),
      composition = coalesce(p_composition, '{}'::jsonb),
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
      or v_latest.features is distinct from v_shader.features
      or v_latest.composition is distinct from v_shader.composition then
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

revoke all on function public.save_shader_state(
  uuid,
  bigint,
  text,
  text,
  jsonb,
  jsonb,
  text,
  text,
  jsonb
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
  jsonb
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
  jsonb
) to authenticated;

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
      composition,
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
    composition = coalesce(v_target.composition, '{}'::jsonb),
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

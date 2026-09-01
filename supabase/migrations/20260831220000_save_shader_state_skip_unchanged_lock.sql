-- Avoid holding the shaders row lock when autosave finds no visual change
-- and is not creating a checkpoint. Unchanged saves were still taking
-- FOR UPDATE, which stacked with library scans on small compute.
create or replace function public.save_shader_state(
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
  where id = p_shader_id;

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

  if not v_changed and p_checkpoint_kind is null then
    return v_shader;
  end if;

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

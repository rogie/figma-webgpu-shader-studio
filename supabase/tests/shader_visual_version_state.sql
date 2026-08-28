begin;

create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000111',
  'authenticated',
  'authenticated',
  'shader-version-test@example.com',
  '',
  now(),
  '{}'::jsonb,
  '{"name":"Version Test"}'::jsonb,
  now(),
  now()
);

do $$
begin
  perform set_config(
    'request.jwt.claim.sub',
    '00000000-0000-0000-0000-000000000111',
    true
  );
  perform set_config('request.jwt.claim.role', 'authenticated', true);
end;
$$;

set local role authenticated;

insert into public.shaders (
  id,
  owner_id,
  name,
  description,
  source,
  kind,
  parameter_values,
  features,
  composition,
  input_path,
  input_name,
  input_mime_type,
  dependency_snapshots,
  is_public,
  thumbnail_path,
  figma_shader_id,
  figma_shader_kind,
  figma_shader_version
)
values (
  '00000000-0000-0000-0000-000000000222',
  '00000000-0000-0000-0000-000000000111',
  'Initial name',
  'Initial description',
  'initial source',
  'composition',
  '{"amount":1}'::jsonb,
  '{"isAnimated":false}'::jsonb,
  '{"layers":[{"id":"layer-1"}]}'::jsonb,
  '00000000-0000-0000-0000-000000000111/00000000-0000-0000-0000-000000000222/assets/input-initial.png',
  'input-initial.png',
  'image/png',
  '{"dependency-initial":{"source":"initial dependency"}}'::jsonb,
  false,
  'owner/shader/thumbnail-initial.webp',
  'figma-initial',
  'effect',
  'v1'
);

reset role;

select ok(
  exists (
    select 1
    from public.shader_versions
    where shader_id = '00000000-0000-0000-0000-000000000222'
      and version_number = 1
      and state_revision = 1
      and checkpoint_kind = 'initial'
      and source = 'initial source'
      and kind = 'composition'
      and parameter_values = '{"amount":1}'::jsonb
      and features = '{"isAnimated":false}'::jsonb
      and composition = '{"layers":[{"id":"layer-1"}]}'::jsonb
      and input_path = '00000000-0000-0000-0000-000000000111/00000000-0000-0000-0000-000000000222/assets/input-initial.png'
      and input_name = 'input-initial.png'
      and input_mime_type = 'image/png'
      and dependency_snapshots
        = '{"dependency-initial":{"source":"initial dependency"}}'::jsonb
      and snapshot_schema_version = 2
  ),
  'initial version captures every visual field'
);

set local role authenticated;

update public.shaders
set
  composition = '{"layers":[{"id":"layer-2"}]}'::jsonb,
  input_path = '00000000-0000-0000-0000-000000000111/00000000-0000-0000-0000-000000000222/assets/input-current.png',
  input_name = 'input-current.png',
  input_mime_type = 'image/png',
  dependency_snapshots = '{"live":{"source":"live dependency"}}'::jsonb
where id = '00000000-0000-0000-0000-000000000222';

reset role;

select is(
  (
    select state_revision
    from public.shaders
    where id = '00000000-0000-0000-0000-000000000222'
  ),
  2::bigint,
  'composition, input, and dependency changes advance one revision'
);

set local role authenticated;

select lives_ok(
  $sql$
    select public.save_shader_state(
      p_shader_id =>
        '00000000-0000-0000-0000-000000000222'::uuid,
      p_expected_state_revision => 2,
      p_source => 'checkpoint source',
      p_kind => 'composition',
      p_parameter_values => '{"amount":2}'::jsonb,
      p_features => '{"isAnimated":true}'::jsonb,
      p_checkpoint_kind => 'manual',
      p_summary => 'Pinned checkpoint',
      p_composition => '{"layers":[{"id":"layer-2"}]}'::jsonb,
      p_input_path => '00000000-0000-0000-0000-000000000111/00000000-0000-0000-0000-000000000222/assets/input-checkpoint.png',
      p_input_name => 'input-checkpoint.png',
      p_input_mime_type => 'image/png',
      p_dependency_snapshots => '{}'::jsonb,
      p_checkpoint_dependency_snapshots =>
        '{"pinned":{"source":"pinned dependency"}}'::jsonb,
      p_input_fields_present => true
    )
  $sql$,
  'complete visual state can be checkpointed'
);

reset role;

select ok(
  exists (
    select 1
    from public.shaders
    where id = '00000000-0000-0000-0000-000000000222'
      and state_revision = 3
      and versioned_state_revision = 3
      and input_path = '00000000-0000-0000-0000-000000000111/00000000-0000-0000-0000-000000000222/assets/input-checkpoint.png'
      and dependency_snapshots
        = '{"pinned":{"source":"pinned dependency"}}'::jsonb
  ),
  'live state stores the same dependency pins as its checkpoint'
);

select ok(
  exists (
    select 1
    from public.shader_versions
    where shader_id = '00000000-0000-0000-0000-000000000222'
      and version_number = 2
      and state_revision = 3
      and checkpoint_kind = 'manual'
      and source = 'checkpoint source'
      and kind = 'composition'
      and parameter_values = '{"amount":2}'::jsonb
      and features = '{"isAnimated":true}'::jsonb
      and composition = '{"layers":[{"id":"layer-2"}]}'::jsonb
      and input_path = '00000000-0000-0000-0000-000000000111/00000000-0000-0000-0000-000000000222/assets/input-checkpoint.png'
      and input_name = 'input-checkpoint.png'
      and input_mime_type = 'image/png'
      and dependency_snapshots
        = '{"pinned":{"source":"pinned dependency"}}'::jsonb
  ),
  'checkpoint stores all fields and resolved dependency pins'
);

set local role authenticated;

select lives_ok(
  $sql$
    select public.save_shader_state(
      p_shader_id =>
        '00000000-0000-0000-0000-000000000222'::uuid,
      p_expected_state_revision => 3,
      p_source => 'checkpoint source',
      p_kind => 'composition',
      p_parameter_values => '{"amount":2}'::jsonb,
      p_features => '{"isAnimated":true}'::jsonb,
      p_checkpoint_kind => 'publish',
      p_summary => 'Duplicate visual',
      p_composition => '{"layers":[{"id":"layer-2"}]}'::jsonb,
      p_input_path => '00000000-0000-0000-0000-000000000111/00000000-0000-0000-0000-000000000222/assets/input-checkpoint.png',
      p_input_name => 'input-checkpoint.png',
      p_input_mime_type => 'image/png',
      p_dependency_snapshots =>
        '{"pinned":{"source":"pinned dependency"}}'::jsonb,
      p_checkpoint_dependency_snapshots =>
        '{"pinned":{"source":"pinned dependency"}}'::jsonb,
      p_input_fields_present => true
    )
  $sql$,
  'a duplicate checkpoint request succeeds'
);

reset role;

select is(
  (
    select count(*)
    from public.shader_versions
    where shader_id = '00000000-0000-0000-0000-000000000222'
  ),
  2::bigint,
  'checkpoint dedup compares the complete visual state'
);

select is(
  (
    select state_revision
    from public.shaders
    where id = '00000000-0000-0000-0000-000000000222'
  ),
  3::bigint,
  'a no-op save does not advance the revision'
);

set local role authenticated;

select throws_ok(
  $sql$
    select public.save_shader_state(
      p_shader_id =>
        '00000000-0000-0000-0000-000000000222'::uuid,
      p_expected_state_revision => 2,
      p_source => 'stale source',
      p_kind => 'effect',
      p_parameter_values => '{}'::jsonb,
      p_features => '{}'::jsonb
    )
  $sql$,
  '40001',
  'shader_state_conflict',
  'stale optimistic revisions are rejected'
);

update public.shaders
set
  name = 'Current name',
  description = 'Current description',
  is_public = true,
  thumbnail_path = 'owner/shader/thumbnail-current.webp',
  figma_shader_id = 'figma-current',
  figma_shader_kind = 'fill',
  figma_shader_version = 'v9'
where id = '00000000-0000-0000-0000-000000000222';

select lives_ok(
  $sql$
    select public.save_shader_state(
      p_shader_id =>
        '00000000-0000-0000-0000-000000000222'::uuid,
      p_expected_state_revision => 3,
      p_source => 'uncheckpointed source',
      p_kind => 'fill',
      p_parameter_values => '{"amount":9}'::jsonb,
      p_features => '{"isAnimated":false,"usesMouse":true}'::jsonb,
      p_checkpoint_kind => 'before_restore',
      p_summary => 'Before restoring an earlier version',
      p_composition => '{}'::jsonb,
      p_input_path => '00000000-0000-0000-0000-000000000111/00000000-0000-0000-0000-000000000222/assets/input-uncheckpointed.webm',
      p_input_name => 'input-uncheckpointed.webm',
      p_input_mime_type => 'video/webm',
      p_dependency_snapshots =>
        '{"uncheckpointed":{"source":"uncheckpointed dependency"}}'::jsonb,
      p_input_fields_present => true
    )
  $sql$,
  'dirty editor state can be checkpointed before restore'
);

reset role;

select is(
  (
    select state_revision
    from public.shaders
    where id = '00000000-0000-0000-0000-000000000222'
  ),
  4::bigint,
  'a before-restore checkpoint advances the visual revision'
);

set local role authenticated;

select lives_ok(
  $sql$
    select public.restore_shader_version(
      p_shader_id =>
        '00000000-0000-0000-0000-000000000222'::uuid,
      p_version_id => (
        select id
        from public.shader_versions
        where shader_id =
          '00000000-0000-0000-0000-000000000222'::uuid
          and version_number = 1
      ),
      p_expected_state_revision => 4
    )
  $sql$,
  'a complete visual version can be restored'
);

reset role;

select ok(
  exists (
    select 1
    from public.shader_versions
    where shader_id = '00000000-0000-0000-0000-000000000222'
      and version_number = 3
      and state_revision = 4
      and checkpoint_kind = 'before_restore'
      and source = 'uncheckpointed source'
      and kind = 'fill'
      and parameter_values = '{"amount":9}'::jsonb
      and features = '{"isAnimated":false,"usesMouse":true}'::jsonb
      and composition = '{}'::jsonb
      and input_path = '00000000-0000-0000-0000-000000000111/00000000-0000-0000-0000-000000000222/assets/input-uncheckpointed.webm'
      and input_name = 'input-uncheckpointed.webm'
      and input_mime_type = 'video/webm'
      and dependency_snapshots =
        '{"uncheckpointed":{"source":"uncheckpointed dependency"}}'::jsonb
  ),
  'restore first captures every uncheckpointed visual field'
);

select ok(
  exists (
    select 1
    from public.shaders
    where id = '00000000-0000-0000-0000-000000000222'
      and state_revision = 5
      and versioned_state_revision = 5
      and source = 'initial source'
      and kind = 'composition'
      and parameter_values = '{"amount":1}'::jsonb
      and features = '{"isAnimated":false}'::jsonb
      and composition = '{"layers":[{"id":"layer-1"}]}'::jsonb
      and input_path = '00000000-0000-0000-0000-000000000111/00000000-0000-0000-0000-000000000222/assets/input-initial.png'
      and input_name = 'input-initial.png'
      and input_mime_type = 'image/png'
      and dependency_snapshots
        = '{"dependency-initial":{"source":"initial dependency"}}'::jsonb
  ),
  'restore applies every visual field'
);

select ok(
  exists (
    select 1
    from public.shaders
    where id = '00000000-0000-0000-0000-000000000222'
      and name = 'Current name'
      and description = 'Current description'
      and is_public
      and thumbnail_path = 'owner/shader/thumbnail-current.webp'
      and figma_shader_id = 'figma-current'
      and figma_shader_kind = 'fill'
      and figma_shader_version = 'v9'
  ),
  'restore excludes current metadata'
);

select ok(
  exists (
    select 1
    from public.shader_versions as restored
    join public.shader_versions as target
      on target.id = restored.restored_from_version_id
    where restored.shader_id =
        '00000000-0000-0000-0000-000000000222'
      and restored.version_number = 4
      and restored.state_revision = 5
      and restored.checkpoint_kind = 'restore'
      and target.version_number = 1
      and restored.source = target.source
      and restored.kind = target.kind
      and restored.parameter_values = target.parameter_values
      and restored.features = target.features
      and restored.composition = target.composition
      and restored.input_path is not distinct from target.input_path
      and restored.input_name is not distinct from target.input_name
      and restored.input_mime_type is not distinct from target.input_mime_type
      and restored.dependency_snapshots = target.dependency_snapshots
  ),
  'restore checkpoint records provenance and complete visual state'
);

reset role;

insert into public.shader_versions (
  id,
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
  dependency_snapshots,
  snapshot_schema_version,
  created_by
)
values (
  '00000000-0000-0000-0000-000000000777',
  '00000000-0000-0000-0000-000000000222',
  99,
  5,
  'manual',
  'Legacy incomplete snapshot',
  'legacy source',
  'effect',
  '{}'::jsonb,
  '{}'::jsonb,
  '{}'::jsonb,
  '{}'::jsonb,
  null,
  '00000000-0000-0000-0000-000000000111'
);

set local role authenticated;

select throws_ok(
  $$
    select public.restore_shader_version(
      '00000000-0000-0000-0000-000000000222',
      '00000000-0000-0000-0000-000000000777',
      5
    )
  $$,
  '22023',
  'shader_version_incomplete',
  'legacy partial snapshots cannot destructively clear unknown visual state'
);

select ok(
  (
    select count(*) = 2
      and bool_and(
        path in (
          '00000000-0000-0000-0000-000000000111/00000000-0000-0000-0000-000000000222/assets/fill.png',
          '00000000-0000-0000-0000-000000000111/00000000-0000-0000-0000-000000000222/assets/input.png'
        )
      )
    from public.shader_snapshot_asset_paths(
      '{
        "input_path":
          "00000000-0000-0000-0000-000000000111/00000000-0000-0000-0000-000000000222/assets/input.png",
        "composition": {
          "effectFills": [{
            "paint": {
              "image": {
                "assetPath":
                  "00000000-0000-0000-0000-000000000111/00000000-0000-0000-0000-000000000222/assets/fill.png"
              }
            }
          }]
        }
      }'::jsonb
    )
  ),
  'snapshot asset extraction finds direct and nested durable paths'
);

set local role authenticated;

insert into public.shaders (
  id,
  owner_id,
  name,
  source,
  kind,
  composition,
  input_path,
  dependency_snapshots
)
values (
  '00000000-0000-0000-0000-000000000333',
  '00000000-0000-0000-0000-000000000111',
  'Dependent composition',
  '',
  'composition',
  '{
    "fills": [{
      "paint": {
        "video": {
          "assetPath":
            "00000000-0000-0000-0000-000000000111/00000000-0000-0000-0000-000000000222/assets/direct.mp4"
        }
      }
    }]
  }'::jsonb,
  '00000000-0000-0000-0000-000000000111/00000000-0000-0000-0000-000000000222/assets/direct-input.png',
  '{
    "cloud:source": {
      "input_path":
        "00000000-0000-0000-0000-000000000111/00000000-0000-0000-0000-000000000222/assets/input.png",
      "composition": {
        "effectFills": [{
          "paint": {
            "image": {
              "assetPath":
                "00000000-0000-0000-0000-000000000111/00000000-0000-0000-0000-000000000222/assets/fill.png"
            }
          }
        }]
      }
    }
  }'::jsonb
);

select ok(
  public.retained_shader_asset_paths(
    '00000000-0000-0000-0000-000000000222'
  ) @> array[
    '00000000-0000-0000-0000-000000000111/00000000-0000-0000-0000-000000000222/assets/input.png',
    '00000000-0000-0000-0000-000000000111/00000000-0000-0000-0000-000000000222/assets/fill.png',
    '00000000-0000-0000-0000-000000000111/00000000-0000-0000-0000-000000000222/assets/direct.mp4',
    '00000000-0000-0000-0000-000000000111/00000000-0000-0000-0000-000000000222/assets/direct-input.png'
  ]::text[],
  'live documents and dependency pins retain source assets through deletion'
);

reset role;

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000444',
  'authenticated',
  'authenticated',
  'shader-asset-attacker@example.com',
  '',
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

insert into public.shaders (
  id,
  owner_id,
  name,
  source,
  kind,
  is_public
)
values (
  '00000000-0000-0000-0000-000000000555',
  '00000000-0000-0000-0000-000000000111',
  'Private asset source',
  'private source',
  'fill',
  false
);

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000444',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select throws_ok(
  $$
    insert into public.shaders (
      id,
      owner_id,
      name,
      source,
      kind,
      input_path
    )
    values (
      '00000000-0000-0000-0000-000000000666',
      '00000000-0000-0000-0000-000000000444',
      'Invalid private asset reference',
      'attacker source',
      'effect',
      '00000000-0000-0000-0000-000000000111/00000000-0000-0000-0000-000000000555/assets/private.png'
    )
  $$,
  '42501',
  'invalid_shader_asset_reference',
  'client-writable document JSON cannot grant access to private assets'
);

select * from finish();
rollback;

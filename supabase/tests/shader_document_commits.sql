begin;

create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001',
  'authenticated', 'authenticated', 'commit-test@example.com', '', now(),
  '{}'::jsonb, '{}'::jsonb, now(), now()
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
set local role authenticated;

create temporary table test_input (document jsonb) on commit drop;
insert into test_input values ('{
  "p_shader_id":"20000000-0000-0000-0000-000000000001",
  "p_kind":"fill",
  "p_source":"initial",
  "p_parameter_values":{},
  "p_features":{},
  "p_composition":{}
}');

select is(
  (public.commit_shader_document(document, '{"name":"Initial"}', true)).name,
  'Initial', 'creates a shader with its initial checkpoint'
)
from test_input;

create temporary table test_claim on commit drop as
select public.claim_shader_plan_build(
  (document->>'p_shader_id')::uuid, repeat('a', 64)
) as claim from test_input;

select is((select claim->>'status' from test_claim), 'claimed', 'first claim owns the plan');
select is(
  public.claim_shader_plan_build('20000000-0000-0000-0000-000000000001', repeat('a', 64))->>'status',
  'building', 'an active claim excludes a second build'
);

select throws_ok(
  $test$
    select public.commit_shader_document(
      document || '{"p_expected_state_revision":1,"p_source":"edited","p_checkpoint_kind":"agent"}',
      '{"name":""}', false, null, '{}', repeat('a', 64), (claim->>'leaseId')::uuid
    ) from test_input cross join test_claim
  $test$,
  '23514', null, 'invalid metadata rejects the entire commit'
);

select is(
  (select source from public.shaders where id = '20000000-0000-0000-0000-000000000001'),
  'initial', 'failed commit leaves original source'
);
select is(
  public.shader_plan_build_status('20000000-0000-0000-0000-000000000001', repeat('a', 64)),
  'building', 'failed commit did not mark the plan built'
);

select is(
  (public.commit_shader_document(
    document || '{"p_expected_state_revision":1,"p_source":"edited","p_checkpoint_kind":"agent"}',
    '{"name":"Edited","description":"Committed together","is_public":true}', false, null, '{}',
    repeat('a', 64), (claim->>'leaseId')::uuid
  )).name,
  'Edited', 'successful commit saves visual state and metadata'
)
from test_input cross join test_claim;

select is(
  public.shader_plan_build_status('20000000-0000-0000-0000-000000000001', repeat('a', 64)),
  'built', 'a successful checkpoint marks the plan built'
);

select is(
  (select shader_name || ' / ' || shader_description || ' / ' || source
    from public.shader_versions
    where shader_id = '20000000-0000-0000-0000-000000000001'
    order by version_number desc limit 1),
  'Edited / Committed together / edited', 'checkpoint captures metadata and source from the same commit'
);

set constraints all immediate;
insert into public.shaders (id, owner_id, name, kind, source, composition, is_public)
values (
  '20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
  'Parent', 'composition', '',
  '{"fills":[{"type":"shader","shaderId":"cloud:20000000-0000-0000-0000-000000000001"}]}',
  true
);
select throws_ok(
  $test$
    update public.shaders set is_public = false where id = '20000000-0000-0000-0000-000000000001'
  $test$,
  '23503', null, 'even a direct update cannot unpublish a referenced shader'
);

select * from finish();
rollback;

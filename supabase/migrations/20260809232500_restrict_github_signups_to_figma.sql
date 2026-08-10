create or replace function public.hook_allow_figma_github_signup(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  signup_provider text :=
    lower(coalesce(event -> 'user' -> 'app_metadata' ->> 'provider', ''));
  signup_email text :=
    lower(trim(coalesce(event -> 'user' ->> 'email', '')));
begin
  if signup_provider <> 'github' then
    return '{}'::jsonb;
  end if;

  if signup_email !~ '^[^@]+@figma\.com$' then
    return jsonb_build_object(
      'error',
      jsonb_build_object(
        'message', 'Use a verified @figma.com email on your GitHub account.',
        'http_code', 403
      )
    );
  end if;

  return '{}'::jsonb;
end;
$$;

revoke execute
  on function public.hook_allow_figma_github_signup(jsonb)
  from public, anon, authenticated;

grant execute
  on function public.hook_allow_figma_github_signup(jsonb)
  to supabase_auth_admin;

comment on function public.hook_allow_figma_github_signup(jsonb)
  is 'Before User Created hook: only new GitHub users with @figma.com email may sign up.';

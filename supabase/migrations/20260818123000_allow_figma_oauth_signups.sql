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
  if signup_provider not in ('github', 'figma') then
    return '{}'::jsonb;
  end if;

  if signup_email !~ '^[^@]+@figma\.com$' then
    return jsonb_build_object(
      'error',
      jsonb_build_object(
        'message',
        'Use a verified @figma.com email on your Figma or GitHub account.',
        'http_code',
        403
      )
    );
  end if;

  return '{}'::jsonb;
end;
$$;

comment on function public.hook_allow_figma_github_signup(jsonb)
  is 'Before User Created hook: GitHub and Figma signups must use a verified @figma.com email.';

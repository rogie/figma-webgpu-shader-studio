alter table public.profiles
add column if not exists avatar_url text
check (avatar_url is null or char_length(avatar_url) <= 2048);

update public.profiles as profiles
set avatar_url = coalesce(
  nullif(users.raw_user_meta_data ->> 'avatar_url', ''),
  nullif(users.raw_user_meta_data ->> 'picture', '')
)
from auth.users as users
where profiles.id = users.id
  and profiles.avatar_url is null;

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    left(
      coalesce(
        nullif(new.raw_user_meta_data ->> 'user_name', ''),
        nullif(new.raw_user_meta_data ->> 'preferred_username', ''),
        nullif(new.raw_user_meta_data ->> 'full_name', ''),
        nullif(new.raw_user_meta_data ->> 'name', ''),
        'Creator'
      ),
      80
    ),
    left(
      coalesce(
        nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
        nullif(new.raw_user_meta_data ->> 'picture', '')
      ),
      2048
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

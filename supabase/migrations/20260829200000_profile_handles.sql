alter table public.profiles
add column if not exists handle text;

alter table public.profiles
drop constraint if exists profiles_handle_format;

alter table public.profiles
add constraint profiles_handle_format check (
  handle is null
  or (
    char_length(handle) between 3 and 30
    and handle = lower(handle)
    and handle ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'
    and handle not in (
      'admin',
      'api',
      'composer',
      'embed',
      'figma',
      'login',
      'me',
      'profile',
      'settings',
      'shader',
      'sign-in',
      'signup'
    )
  )
);

create unique index if not exists profiles_handle_unique
on public.profiles (lower(handle))
where handle is not null;

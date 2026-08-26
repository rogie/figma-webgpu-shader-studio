alter table public.shaders
  add column if not exists description text
  check (description is null or char_length(description) <= 1000);

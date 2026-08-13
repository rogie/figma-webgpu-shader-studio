-- Link studio shaders to Figma custom-library entries (read/import now; push later).
alter table public.shaders
  add column if not exists figma_shader_id text,
  add column if not exists figma_shader_kind text
    check (figma_shader_kind is null or figma_shader_kind in ('effect', 'fill')),
  add column if not exists figma_shader_version text;

create index if not exists shaders_figma_shader_id_idx
  on public.shaders (figma_shader_id)
  where figma_shader_id is not null;

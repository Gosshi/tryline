alter table public.competitions
  add column if not exists family text;

-- Derive family from existing slugs.
-- slug pattern: "{family}-{season}" (e.g. six-nations-2025 -> six-nations)
update public.competitions
set family = regexp_replace(slug, '-\d{4}$', '')
where family is null;

alter table public.competitions
  alter column family set not null;

create index if not exists idx_competitions_family
  on public.competitions (family);

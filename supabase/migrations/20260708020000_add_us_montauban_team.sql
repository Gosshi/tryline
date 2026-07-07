insert into public.teams (
  slug,
  name,
  short_code,
  country,
  name_ja,
  english_name,
  external_ids
)
values (
  'us-montauban',
  'US Montauban',
  'USM',
  'FRA',
  'USモントーバン',
  'US Montauban',
  jsonb_build_object('wikipedia', 'US Montauban', 'website', 'https://usmsapiac.fr/')
)
on conflict (slug) do update
set
  name = excluded.name,
  short_code = excluded.short_code,
  country = excluded.country,
  name_ja = excluded.name_ja,
  english_name = excluded.english_name,
  external_ids = teams.external_ids || excluded.external_ids;

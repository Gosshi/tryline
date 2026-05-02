insert into public.teams (slug, name, short_code, country)
values
  ('blues', 'Blues', 'BLU', 'NZL'),
  ('chiefs', 'Chiefs', 'CHI', 'NZL'),
  ('crusaders', 'Crusaders', 'CRU', 'NZL'),
  ('highlanders', 'Highlanders', 'HIG', 'NZL'),
  ('hurricanes', 'Hurricanes', 'HUR', 'NZL'),
  ('brumbies', 'Brumbies', 'BRU', 'AUS'),
  ('force', 'Western Force', 'FOR', 'AUS'),
  ('reds', 'Queensland Reds', 'RED', 'AUS'),
  ('rebels', 'Melbourne Rebels', 'REB', 'AUS'),
  ('waratahs', 'Waratahs', 'WAR', 'AUS'),
  ('fijian-drua', 'Fijian Drua', 'DRU', 'FJI'),
  ('moana-pasifika', 'Moana Pasifika', 'MOA', 'WSM')
on conflict (slug) do update
set
  name = excluded.name,
  short_code = excluded.short_code,
  country = excluded.country;

insert into public.teams (slug, name, short_code, country)
values
  ('new-zealand', 'New Zealand', 'NZL', 'NZL'),
  ('south-africa', 'South Africa', 'RSA', 'ZAF'),
  ('australia', 'Australia', 'AUS', 'AUS'),
  ('argentina', 'Argentina', 'ARG', 'ARG'),
  ('fiji', 'Fiji', 'FIJ', 'FJI'),
  ('samoa', 'Samoa', 'SAM', 'WSM'),
  ('tonga', 'Tonga', 'TON', 'TON'),
  ('japan', 'Japan', 'JPN', 'JPN'),
  ('usa', 'United States', 'USA', 'USA'),
  ('canada', 'Canada', 'CAN', 'CAN'),
  ('georgia', 'Georgia', 'GEO', 'GEO'),
  ('uruguay', 'Uruguay', 'URU', 'URY'),
  ('namibia', 'Namibia', 'NAM', 'NAM'),
  ('portugal', 'Portugal', 'POR', 'PRT'),
  ('spain', 'Spain', 'ESP', 'ESP'),
  ('romania', 'Romania', 'ROU', 'ROU')
on conflict (slug) do update
set
  name = excluded.name,
  short_code = excluded.short_code,
  country = excluded.country;

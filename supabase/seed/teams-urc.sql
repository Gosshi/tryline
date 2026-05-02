insert into public.teams (slug, name, short_code, country)
values
  ('leinster', 'Leinster', 'LEI', 'IRL'),
  ('munster', 'Munster', 'MUN', 'IRL'),
  ('connacht', 'Connacht', 'CON', 'IRL'),
  ('ulster', 'Ulster', 'ULS', 'IRL'),
  ('glasgow-warriors', 'Glasgow Warriors', 'GLA', 'GBR'),
  ('edinburgh', 'Edinburgh', 'EDI', 'GBR'),
  ('cardiff', 'Cardiff Rugby', 'CAR', 'GBR'),
  ('ospreys', 'Ospreys', 'OSP', 'GBR'),
  ('scarlets', 'Scarlets', 'SCA', 'GBR'),
  ('dragons', 'Dragons', 'DRA', 'GBR'),
  ('benetton', 'Benetton', 'BEN', 'ITA'),
  ('zebre', 'Zebre Parma', 'ZEB', 'ITA'),
  ('bulls', 'Bulls', 'BUL', 'ZAF'),
  ('lions', 'Lions', 'LIO', 'ZAF'),
  ('sharks', 'Sharks', 'SHA', 'ZAF'),
  ('stormers', 'Stormers', 'STO', 'ZAF')
on conflict (slug) do update
set
  name = excluded.name,
  short_code = excluded.short_code,
  country = excluded.country;

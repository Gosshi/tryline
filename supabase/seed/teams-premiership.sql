insert into public.teams (slug, name, short_code, country)
values
  ('bath', 'Bath Rugby', 'BAT', 'GBR'),
  ('bristol-bears', 'Bristol Bears', 'BRI', 'GBR'),
  ('exeter-chiefs', 'Exeter Chiefs', 'EXE', 'GBR'),
  ('gloucester', 'Gloucester Rugby', 'GLO', 'GBR'),
  ('harlequins', 'Harlequins', 'HAR', 'GBR'),
  ('leicester-tigers', 'Leicester Tigers', 'LEI', 'GBR'),
  ('newcastle-falcons', 'Newcastle Falcons', 'NEW', 'GBR'),
  ('northampton-saints', 'Northampton Saints', 'NOR', 'GBR'),
  ('sale-sharks', 'Sale Sharks', 'SAL', 'GBR'),
  ('saracens', 'Saracens', 'SAR', 'GBR')
on conflict (slug) do update
set
  name = excluded.name,
  short_code = excluded.short_code,
  country = excluded.country;

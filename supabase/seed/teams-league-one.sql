insert into public.teams (slug, name, short_code, country)
values
  ('saitama-wild-knights', 'Saitama Wild Knights', 'SAI', 'JPN'),
  ('kubota-spears', 'Kubota Spears Funabashi Tokyo Bay', 'KUB', 'JPN'),
  ('toyota-verblitz', 'Toyota Verblitz', 'TOY', 'JPN'),
  ('tokyo-suntory-sungoliath', 'Tokyo Suntory Sungoliath', 'SUN', 'JPN'),
  ('kobelco-kobe-steelers', 'Kobelco Kobe Steelers', 'KOB', 'JPN'),
  ('toshiba-brave-lupus', 'Toshiba Brave Lupus Tokyo', 'TBL', 'JPN'),
  ('ntt-black-storms', 'Black Rams Tokyo', 'BRT', 'JPN'),
  ('canon-eagles', 'Yokohama Canon Eagles', 'YCE', 'JPN'),
  ('mitsubishi-dynaboars', 'Mitsubishi Sagamihara DynaBoars', 'SDB', 'JPN'),
  ('ricoh-black-rams', 'Black Rams Tokyo', 'BRT', 'JPN'),
  ('shizuoka-blue-revs', 'Shizuoka Blue Revs', 'SBR', 'JPN'),
  ('honda-heat', 'Mie Honda Heat', 'MHH', 'JPN')
on conflict (slug) do update
set
  name = excluded.name,
  short_code = excluded.short_code,
  country = excluded.country;

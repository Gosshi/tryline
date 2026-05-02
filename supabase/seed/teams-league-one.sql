insert into public.teams (slug, name, short_code, country)
values
  ('saitama-wild-knights', '埼玉パナソニックワイルドナイツ', 'SAI', 'JPN'),
  ('kubota-spears', 'クボタスピアーズ船橋・東京ベイ', 'KUB', 'JPN'),
  ('toyota-verblitz', 'トヨタヴェルブリッツ', 'TOY', 'JPN'),
  ('tokyo-suntory-sungoliath', '東京サントリーサンゴリアス', 'SUN', 'JPN'),
  ('kobelco-kobe-steelers', 'コベルコ神戸スティーラーズ', 'KOB', 'JPN'),
  ('toshiba-brave-lupus', '東芝ブレイブルーパス東京', 'TBL', 'JPN'),
  ('urayasu-d-rocks', '浦安D-Rocks', 'UDR', 'JPN'),
  ('canon-eagles', '横浜キヤノンイーグルス', 'YCE', 'JPN'),
  ('mitsubishi-dynaboars', '三菱重工相模原ダイナボアーズ', 'SDB', 'JPN'),
  ('ricoh-black-rams', '東京ブラックラムズ', 'BRT', 'JPN'),
  ('shizuoka-blue-revs', '静岡ブルーレヴズ', 'SBR', 'JPN'),
  ('honda-heat', '三重ホンダヒート', 'MHH', 'JPN')
on conflict (slug) do update
set
  name = excluded.name,
  short_code = excluded.short_code,
  country = excluded.country;

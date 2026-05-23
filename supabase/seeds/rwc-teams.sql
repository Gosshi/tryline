insert into teams (slug, name, short_code) values
  ('new-zealand',  'New Zealand All Blacks',   'NZL'),
  ('south-africa', 'South Africa Springboks',  'RSA'),
  ('australia',    'Australia Wallabies',       'AUS'),
  ('argentina',    'Argentina Los Pumas',       'ARG'),
  ('japan',        'Japan Brave Blossoms',      'JPN'),
  ('fiji',         'Fiji Flying Fijians',       'FIJ'),
  ('samoa',        'Samoa Manu Samoa',          'SAM'),
  ('tonga',        'Tonga',                     'TGA'),
  ('georgia',      'Georgia',                   'GEO'),
  ('romania',      'Romania',                   'ROM'),
  ('uruguay',      'Uruguay',                   'URU')
on conflict (slug) do nothing;
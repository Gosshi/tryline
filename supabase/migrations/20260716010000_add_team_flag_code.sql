alter table public.teams
  add column if not exists flag_code text;

with country_flags(country, flag_code) as (
  values
    ('ARG', '🇦🇷'),
    ('Argentina', '🇦🇷'),
    ('AUS', '🇦🇺'),
    ('Australia', '🇦🇺'),
    ('CAN', '🇨🇦'),
    ('Canada', '🇨🇦'),
    ('CHL', '🇨🇱'),
    ('Chile', '🇨🇱'),
    ('ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿'),
    ('ESP', '🇪🇸'),
    ('Spain', '🇪🇸'),
    ('FIJ', '🇫🇯'),
    ('FJI', '🇫🇯'),
    ('Fiji', '🇫🇯'),
    ('FRA', '🇫🇷'),
    ('France', '🇫🇷'),
    ('GEO', '🇬🇪'),
    ('Georgia', '🇬🇪'),
    ('HKG', '🇭🇰'),
    ('Hong Kong China', '🇭🇰'),
    ('IRL', '🇮🇪'),
    ('Ireland', '🇮🇪'),
    ('ITA', '🇮🇹'),
    ('Italy', '🇮🇹'),
    ('JPN', '🇯🇵'),
    ('Japan', '🇯🇵'),
    ('NAM', '🇳🇦'),
    ('Namibia', '🇳🇦'),
    ('NZL', '🇳🇿'),
    ('New Zealand', '🇳🇿'),
    ('POR', '🇵🇹'),
    ('PRT', '🇵🇹'),
    ('Portugal', '🇵🇹'),
    ('ROM', '🇷🇴'),
    ('ROU', '🇷🇴'),
    ('Romania', '🇷🇴'),
    ('RSA', '🇿🇦'),
    ('South Africa', '🇿🇦'),
    ('SAM', '🇼🇸'),
    ('SCO', '🏴󠁧󠁢󠁳󠁣󠁴󠁿'),
    ('TON', '🇹🇴'),
    ('Tonga', '🇹🇴'),
    ('URU', '🇺🇾'),
    ('URY', '🇺🇾'),
    ('Uruguay', '🇺🇾'),
    ('USA', '🇺🇸'),
    ('United States', '🇺🇸'),
    ('WAL', '🏴󠁧󠁢󠁷󠁬󠁳󠁿'),
    ('WSM', '🇼🇸'),
    ('Samoa', '🇼🇸'),
    ('ZAF', '🇿🇦'),
    ('ZWE', '🇿🇼'),
    ('Zimbabwe', '🇿🇼')
)
update public.teams
set flag_code = country_flags.flag_code
from country_flags
where teams.country = country_flags.country;

update public.teams
set flag_code = '🏴󠁧󠁢󠁥󠁮󠁧󠁿'
where slug in (
  'england',
  'bath',
  'bristol-bears',
  'exeter-chiefs',
  'gloucester',
  'harlequins',
  'leicester-tigers',
  'newcastle-falcons',
  'northampton-saints',
  'sale-sharks',
  'saracens'
);

update public.teams
set flag_code = '🏴󠁧󠁢󠁷󠁬󠁳󠁿'
where slug in (
  'wales',
  'cardiff',
  'dragons',
  'ospreys',
  'scarlets'
);

update public.teams
set flag_code = '🏴󠁧󠁢󠁳󠁣󠁴󠁿'
where slug in (
  'scotland',
  'edinburgh',
  'glasgow-warriors'
);

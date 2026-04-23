insert into public.competitions (slug, name, country, season, start_date, end_date)
values (
  'six-nations-2027',
  'Six Nations 2027',
  null,
  '2027',
  '2027-02-06',
  '2027-03-20'
)
on conflict (slug) do update
set
  name = excluded.name,
  country = excluded.country,
  season = excluded.season,
  start_date = excluded.start_date,
  end_date = excluded.end_date;

insert into public.teams (slug, name, short_code, country)
values
  ('england', 'England', 'ENG', 'GBR'),
  ('france', 'France', 'FRA', 'FRA'),
  ('ireland', 'Ireland', 'IRL', 'IRL'),
  ('scotland', 'Scotland', 'SCO', 'GBR'),
  ('wales', 'Wales', 'WAL', 'GBR'),
  ('italy', 'Italy', 'ITA', 'ITA')
on conflict (slug) do update
set
  name = excluded.name,
  short_code = excluded.short_code,
  country = excluded.country;

insert into public.competition_teams (competition_id, team_id)
select competitions.id, teams.id
from public.competitions
cross join public.teams
where competitions.slug = 'six-nations-2027'
  and teams.slug in ('england', 'france', 'ireland', 'scotland', 'wales', 'italy')
on conflict (competition_id, team_id) do nothing;

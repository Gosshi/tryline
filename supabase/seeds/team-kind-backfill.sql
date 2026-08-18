-- Run this only after 20260818160000_add_team_kind.sql has been applied.
-- Step 1: review the complete 91-team classification before making any update.
-- National teams are identified only by appearances in representative competitions.
-- Do not use teams.world_ranking as a classification signal.
with representative_families(family) as (
  values
    ('six-nations'),
    ('nations-championship'),
    ('autumn-nations'),
    ('pnc'),
    ('rwc'),
    ('rugby-championship'),
    ('lipovitan-challenge-cup')
),
team_appearances as (
  select
    teams.id,
    teams.slug,
    teams.name,
    bool_or(representative_families.family is not null) as has_national_appearance,
    bool_or(representative_families.family is null) as has_club_appearance
  from public.teams
  left join public.matches
    on teams.id in (matches.home_team_id, matches.away_team_id)
  left join public.competitions
    on competitions.id = matches.competition_id
  left join representative_families
    on representative_families.family = competitions.family
  group by teams.id, teams.slug, teams.name
)
select
  slug,
  name,
  case
    when has_national_appearance and has_club_appearance then 'ambiguous'
    when has_national_appearance then 'national'
    else 'club'
  end as proposed_kind
from team_appearances
order by proposed_kind, slug;

-- Expected review result as of 2026-08-18:
-- national: 25; club: 66; ambiguous: 0.
-- The four teams with no matches remain the default 'club'.
-- Step 2: after Owner review, run the following statement separately.
--
-- with representative_families(family) as (
--   values
--     ('six-nations'),
--     ('nations-championship'),
--     ('autumn-nations'),
--     ('pnc'),
--     ('rwc'),
--     ('rugby-championship'),
--     ('lipovitan-challenge-cup')
-- ),
-- national_teams as (
--   select distinct teams.id
--   from public.teams
--   join public.matches
--     on teams.id in (matches.home_team_id, matches.away_team_id)
--   join public.competitions
--     on competitions.id = matches.competition_id
--   join representative_families
--     on representative_families.family = competitions.family
--   where not exists (
--     select 1
--     from public.matches club_matches
--     join public.competitions club_competitions
--       on club_competitions.id = club_matches.competition_id
--     left join representative_families club_families
--       on club_families.family = club_competitions.family
--     where teams.id in (club_matches.home_team_id, club_matches.away_team_id)
--       and club_families.family is null
--   )
-- )
-- update public.teams
-- set kind = 'national'
-- where id in (select id from national_teams)
-- returning slug, name, kind;

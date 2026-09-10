alter table public.competitions
  add column season_status text not null default 'unknown'
    check (season_status in ('held', 'not_held', 'unknown')),
  add column replacement_competition_id uuid null
    references public.competitions(id);

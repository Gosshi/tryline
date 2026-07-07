alter table public.teams
  add column if not exists world_ranking integer,
  add column if not exists world_ranking_updated_at timestamptz;

create table public.competition_standings (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions,
  team_id uuid not null references public.teams,
  position integer not null,
  played integer not null default 0,
  won integer not null default 0,
  drawn integer not null default 0,
  lost integer not null default 0,
  points_for integer not null default 0,
  points_against integer not null default 0,
  tries_for integer not null default 0,
  bonus_points_try integer not null default 0,
  bonus_points_losing integer not null default 0,
  total_points integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (competition_id, team_id)
);

create index competition_standings_competition_position_idx
  on public.competition_standings (competition_id, position);

alter table public.competition_standings enable row level security;

create policy "competition standings are publicly readable"
  on public.competition_standings
  for select
  to anon, authenticated
  using (true);

create trigger set_competition_standings_updated_at
  before update on public.competition_standings
  for each row execute function public.set_updated_at();

create table public.match_lineups (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches on delete cascade,
  team_id uuid not null references public.teams,
  player_id uuid not null references public.players,
  jersey_number smallint not null check (jersey_number between 1 and 23),
  is_starter boolean not null generated always as (jersey_number <= 15) stored,
  announced_at timestamptz,
  source_url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, team_id, jersey_number)
);

alter table public.match_lineups enable row level security;

create policy "match lineups are publicly readable"
  on public.match_lineups
  for select
  to anon, authenticated
  using (true);

create trigger set_match_lineups_updated_at
  before update on public.match_lineups
  for each row execute function public.set_updated_at();

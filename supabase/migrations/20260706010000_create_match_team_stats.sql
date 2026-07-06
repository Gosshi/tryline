create table if not exists public.match_team_stats (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id),
  team_id uuid not null references public.teams(id),
  possession_pct numeric,
  territory_pct numeric,
  lineouts_won integer,
  lineouts_total integer,
  scrums_won integer,
  scrums_total integer,
  tackles_made integer,
  tackles_missed integer,
  carries integer,
  penalties_conceded integer,
  yellow_cards integer,
  red_cards integer,
  errors integer,
  source text not null default 'top14-lnr',
  source_url text not null,
  created_at timestamptz not null default now(),
  unique (match_id, team_id)
);

alter table public.match_team_stats enable row level security;

create policy "match team stats are publicly readable"
  on public.match_team_stats
  for select
  to anon, authenticated
  using (true);

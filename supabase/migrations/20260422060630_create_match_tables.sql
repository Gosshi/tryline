create table public.matches (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions,
  home_team_id uuid not null references public.teams,
  away_team_id uuid not null references public.teams,
  kickoff_at timestamptz not null,
  venue text,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'in_progress', 'finished', 'postponed', 'cancelled')),
  home_score integer,
  away_score integer,
  broadcast_jp_url text,
  external_ids jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competition_id, home_team_id, away_team_id, kickoff_at),
  check (home_team_id <> away_team_id)
);

create table public.match_raw_data (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches on delete cascade,
  source text not null,
  source_url text not null,
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);

create table public.match_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches on delete cascade,
  minute integer not null,
  type text not null
    check (
      type in (
        'try',
        'conversion',
        'penalty_goal',
        'drop_goal',
        'yellow_card',
        'red_card',
        'substitution'
      )
    ),
  team_id uuid not null references public.teams,
  player_id uuid references public.players,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

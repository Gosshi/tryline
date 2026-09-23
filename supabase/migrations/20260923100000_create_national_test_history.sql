create table public.national_test_history (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  opponent_team_id uuid not null references public.teams(id) on delete cascade,
  played_on date not null,
  team_score integer not null,
  opponent_score integer not null,
  venue text,
  competition_label text,
  source_url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint national_test_history_distinct_teams check (team_id <> opponent_team_id),
  constraint national_test_history_team_opponent_played_on_key unique (team_id, opponent_team_id, played_on)
);

create trigger set_national_test_history_updated_at
  before update on public.national_test_history
  for each row execute function public.set_updated_at();

create index national_test_history_opponent_team_id_idx
  on public.national_test_history (opponent_team_id, team_id, played_on desc);

alter table public.national_test_history enable row level security;

grant select on public.national_test_history to anon, authenticated;

create policy "National test history is readable by everyone"
  on public.national_test_history
  for select
  to anon, authenticated
  using (true);

alter table public.competitions enable row level security;
alter table public.teams enable row level security;
alter table public.competition_teams enable row level security;
alter table public.players enable row level security;
alter table public.matches enable row level security;
alter table public.match_raw_data enable row level security;
alter table public.match_events enable row level security;
alter table public.users enable row level security;
alter table public.match_chats enable row level security;

create policy "competitions are publicly readable"
  on public.competitions
  for select
  to anon, authenticated
  using (true);

create policy "teams are publicly readable"
  on public.teams
  for select
  to anon, authenticated
  using (true);

create policy "competition teams are publicly readable"
  on public.competition_teams
  for select
  to anon, authenticated
  using (true);

create policy "players are publicly readable"
  on public.players
  for select
  to anon, authenticated
  using (true);

create policy "matches are publicly readable"
  on public.matches
  for select
  to anon, authenticated
  using (true);

create policy "match events are publicly readable"
  on public.match_events
  for select
  to anon, authenticated
  using (true);

create policy "users can read their own profile"
  on public.users
  for select
  to authenticated
  using (auth.uid() = id);

create policy "users can update their own profile"
  on public.users
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "users can manage their own match chats"
  on public.match_chats
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

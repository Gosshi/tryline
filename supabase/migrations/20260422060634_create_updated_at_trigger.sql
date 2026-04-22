create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger set_competitions_updated_at
  before update on public.competitions
  for each row execute function public.set_updated_at();

create trigger set_teams_updated_at
  before update on public.teams
  for each row execute function public.set_updated_at();

create trigger set_players_updated_at
  before update on public.players
  for each row execute function public.set_updated_at();

create trigger set_matches_updated_at
  before update on public.matches
  for each row execute function public.set_updated_at();

create trigger set_users_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

create trigger set_match_chats_updated_at
  before update on public.match_chats
  for each row execute function public.set_updated_at();

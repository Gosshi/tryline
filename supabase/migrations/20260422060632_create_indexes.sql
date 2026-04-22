create index matches_kickoff_idx on public.matches (kickoff_at);
create index matches_competition_kickoff_idx on public.matches (competition_id, kickoff_at);
create index matches_status_idx on public.matches (status);

create index players_team_idx on public.players (team_id);

create index match_raw_data_match_idx on public.match_raw_data (match_id, source);
create index match_raw_data_expires_idx on public.match_raw_data (expires_at);

create index match_events_match_idx on public.match_events (match_id, minute);

create index match_chats_user_match_idx on public.match_chats (user_id, match_id);

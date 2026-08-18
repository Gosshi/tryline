alter table public.teams
  add column kind text not null default 'club'
  check (kind in ('national', 'club'));

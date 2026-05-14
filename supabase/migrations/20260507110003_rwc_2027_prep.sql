create table if not exists competition_pools (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete cascade,
  pool_name text not null,
  team_id uuid not null references teams(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (competition_id, team_id)
);

alter table competition_pools enable row level security;

create policy "competition_pools are publicly readable"
  on competition_pools for select using (true);

insert into public.teams (slug, name, short_code, country)
values
  ('new-zealand', 'New Zealand All Blacks', 'NZL', 'NZL'),
  ('south-africa', 'South Africa Springboks', 'RSA', 'ZAF'),
  ('australia', 'Australia Wallabies', 'AUS', 'AUS'),
  ('argentina', 'Argentina Los Pumas', 'ARG', 'ARG'),
  ('japan', 'Japan Brave Blossoms', 'JPN', 'JPN'),
  ('fiji', 'Fiji Flying Fijians', 'FIJ', 'FJI'),
  ('samoa', 'Samoa Manu Samoa', 'SAM', 'WSM'),
  ('tonga', 'Tonga', 'TGA', 'TON'),
  ('georgia', 'Georgia', 'GEO', 'GEO'),
  ('romania', 'Romania', 'ROM', 'ROU'),
  ('uruguay', 'Uruguay', 'URU', 'URY')
on conflict (slug) do nothing;

alter table user_profiles
  add column if not exists favorite_team_slugs text[] not null default '{}';

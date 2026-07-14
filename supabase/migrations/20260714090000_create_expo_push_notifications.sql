create table public.expo_push_tokens (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  user_id uuid references auth.users(id) on delete cascade,
  team_slugs text[] not null default '{}',
  notify_prematch boolean not null default true,
  notify_content boolean not null default true,
  spoiler_guard boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index expo_push_tokens_notify_prematch_idx
  on public.expo_push_tokens using gin (team_slugs)
  where notify_prematch = true;

create index expo_push_tokens_notify_content_idx
  on public.expo_push_tokens using gin (team_slugs)
  where notify_content = true;

create index expo_push_tokens_user_id_idx
  on public.expo_push_tokens (user_id);

create trigger set_expo_push_tokens_updated_at
  before update on public.expo_push_tokens
  for each row execute function public.set_updated_at();

alter table public.expo_push_tokens enable row level security;
revoke all on public.expo_push_tokens from anon, authenticated;

create table public.push_notification_log (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  kind text not null check (kind in ('prematch', 'preview', 'recap')),
  sent_count integer not null default 0,
  sent_at timestamptz not null default now(),
  unique (match_id, kind)
);

create index push_notification_log_match_kind_idx
  on public.push_notification_log (match_id, kind);

alter table public.push_notification_log enable row level security;
revoke all on public.push_notification_log from anon, authenticated;

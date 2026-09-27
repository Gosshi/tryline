create table public.x_post_tasks (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  kind text not null check (kind in ('prematch', 'postmatch')),
  status text not null default 'pending'
    check (status in ('pending', 'posted', 'skipped', 'missed')),
  due_at timestamptz not null,
  reminded_at timestamptz,
  re_reminded_at timestamptz,
  discord_message_id text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (match_id, kind)
);

alter table public.x_post_tasks enable row level security;

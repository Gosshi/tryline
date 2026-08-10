create table if not exists email_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'unsubscribed')),
  confirmation_token text unique,
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  source text not null,
  created_at timestamptz not null default now()
);

create index if not exists email_subscribers_confirmed_idx
  on email_subscribers (status)
  where status = 'confirmed';

alter table email_subscribers enable row level security;

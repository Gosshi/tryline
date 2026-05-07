create table if not exists chat_sessions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table chat_sessions enable row level security;

create policy "public insert" on chat_sessions
  for insert with check (true);

create policy "public select" on chat_sessions
  for select using (true);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references chat_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  input_tokens int,
  output_tokens int,
  cost_usd numeric(10, 6),
  created_at timestamptz not null default now()
);

alter table chat_messages enable row level security;

create policy "public insert" on chat_messages
  for insert with check (true);

create policy "public select" on chat_messages
  for select using (true);

create index if not exists chat_messages_session_id_created_at_idx
  on chat_messages (session_id, created_at);

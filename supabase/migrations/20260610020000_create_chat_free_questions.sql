create table if not exists chat_free_questions (
  user_id uuid not null references auth.users(id) on delete cascade,
  match_id uuid not null references matches(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, match_id)
);

alter table chat_free_questions enable row level security;

create policy "own chat free questions" on chat_free_questions
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table public.users (
  id uuid primary key references auth.users on delete cascade,
  email text not null,
  display_name text,
  plan text not null default 'free'
    check (plan in ('free', 'premium')),
  stripe_customer_id text,
  interests jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.match_chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users on delete cascade,
  match_id uuid not null references public.matches on delete cascade,
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, match_id)
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

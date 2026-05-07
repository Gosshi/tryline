create table if not exists user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  subscription_status text not null default 'free'
    check (subscription_status in ('free', 'premium', 'cancelled')),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table user_profiles enable row level security;

create policy "own profile" on user_profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into user_profiles (id) values (new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

create table if not exists public.match_broadcasts (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  service_name text not null,
  url text not null,
  kind text not null check (kind in ('tv', 'streaming')),
  display_order integer not null default 0,
  verified_at timestamptz not null default now(),
  source_url text,
  created_at timestamptz not null default now(),
  unique (match_id, service_name)
);

create index if not exists match_broadcasts_match_id_idx
  on public.match_broadcasts (match_id);

alter table public.match_broadcasts enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'match_broadcasts'
      and policyname = 'public read'
  ) then
    create policy "public read"
      on public.match_broadcasts
      for select
      to anon, authenticated
      using (true);
  end if;
end
$$;

revoke all on public.match_broadcasts from anon, authenticated;
grant select on public.match_broadcasts to anon, authenticated;

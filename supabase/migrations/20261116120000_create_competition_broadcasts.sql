create table if not exists public.competition_broadcasts (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  service_name text not null,
  url text not null,
  kind text not null check (kind in ('tv', 'streaming')),
  display_order integer not null default 0,
  verified_at timestamptz not null default now(),
  source_url text not null,
  created_at timestamptz not null default now(),
  unique (competition_id, service_name)
);

create index if not exists competition_broadcasts_competition_id_idx
  on public.competition_broadcasts (competition_id);

alter table public.competition_broadcasts enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'competition_broadcasts'
      and policyname = 'public read'
  ) then
    create policy "public read"
      on public.competition_broadcasts
      for select
      to anon, authenticated
      using (true);
  end if;
end
$$;

revoke all on public.competition_broadcasts from anon, authenticated;
grant select on public.competition_broadcasts to anon, authenticated;

comment on table public.competition_broadcasts is
  'Only services broadcasting every match in the competition may be listed here; source_url must substantiate that coverage.';

insert into public.competition_broadcasts
  (competition_id, service_name, url, kind, display_order, verified_at, source_url)
select c.id, v.service_name, v.url, v.kind, v.display_order, '2026-11-16T12:00:00Z', v.source_url
from public.competitions c
cross join (values
  ('J SPORTS（BS）', 'https://www.jsports.co.jp/rugby/league-one/', 'tv', 0,
   'https://prtimes.jp/main/html/rd/p/000000636.000014079.html'),
  ('J SPORTSオンデマンド', 'https://www.jsports.co.jp/rugby/league-one/', 'streaming', 10,
   'https://prtimes.jp/main/html/rd/p/000000636.000014079.html'),
  ('DAZN', 'https://www.dazn.com/ja-JP/', 'streaming', 20,
   'https://dazngroup.com/press-room/1015/')
) as v(service_name, url, kind, display_order, source_url)
where c.slug = 'league-one-2026-27'
on conflict (competition_id, service_name) do nothing;

create table if not exists public.match_sourced_facts (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches on delete cascade,
  content_type text not null
    check (content_type in ('preview', 'recap', 'shared')),
  fact text not null,
  source_url text not null,
  source_domain text not null,
  confidence text not null
    check (confidence in ('high', 'medium', 'low')),
  fetched_at timestamptz not null default now(),
  model_version text not null,
  metadata jsonb not null default '{}'::jsonb,
  unique (match_id, fact)
);

create index if not exists match_sourced_facts_match_type_idx
  on public.match_sourced_facts (match_id, content_type, confidence);

create index if not exists match_sourced_facts_source_domain_idx
  on public.match_sourced_facts (source_domain);

alter table public.match_sourced_facts enable row level security;

create policy "match sourced facts are publicly readable"
  on public.match_sourced_facts
  for select
  to anon, authenticated
  using (true);

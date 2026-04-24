create table public.match_content (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches on delete cascade,
  content_type text not null
    check (content_type in ('preview', 'recap', 'tactical_notes')),
  content_md_ja text not null,
  model_version text not null,
  prompt_version text not null,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'rejected')),
  generated_at timestamptz not null default now(),
  qa_scores jsonb not null,
  unique (match_id, content_type)
);

create table public.pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  match_id uuid references public.matches on delete cascade,
  content_type text not null,
  stage integer not null,
  input_hash text,
  output jsonb,
  cost_usd numeric,
  duration_ms integer,
  status text check (status in ('success', 'retry', 'failed')),
  error_message text,
  created_at timestamptz not null default now()
);

create index match_content_match_type_idx
  on public.match_content (match_id, content_type);

create index match_content_status_match_type_idx
  on public.match_content (status, match_id, content_type);

create index pipeline_runs_match_stage_idx
  on public.pipeline_runs (match_id, stage);

alter table public.match_content enable row level security;
alter table public.pipeline_runs enable row level security;

create policy "published match content is publicly readable"
  on public.match_content
  for select
  to anon, authenticated
  using (status = 'published');

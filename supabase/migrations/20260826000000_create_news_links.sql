create table public.news_links (
  id uuid primary key default gen_random_uuid(),
  source_domain text not null,
  source_url text not null unique,
  title text not null,
  title_ja text,
  published_at timestamptz,
  matched_match_id uuid references public.matches(id),
  notified_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.news_links enable row level security;

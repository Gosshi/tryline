create table public.weekly_news_items (
  id uuid primary key default gen_random_uuid(),
  week_from date not null,
  week_to date not null,
  category text not null check (category in ('transfer', 'quote', 'competition', 'injury', 'other')),
  title_ja text not null,
  summary_ja text not null,
  source_domain text not null,
  source_url text not null,
  published_at timestamptz,
  fetched_at timestamptz not null,
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  status text not null default 'draft' check (status in ('draft', 'published')),
  model_version text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

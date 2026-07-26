alter table public.weekly_news_items enable row level security;

create policy "published weekly news items are publicly readable"
  on public.weekly_news_items
  for select
  to anon, authenticated
  using (status = 'published');

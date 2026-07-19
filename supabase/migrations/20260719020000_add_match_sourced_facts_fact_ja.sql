alter table public.match_sourced_facts
  add column if not exists fact_ja text;

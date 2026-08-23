alter table public.match_sourced_facts
  drop constraint if exists match_sourced_facts_match_id_fact_key;

alter table public.match_sourced_facts
  add constraint match_sourced_facts_match_id_content_type_fact_key
  unique (match_id, content_type, fact);

-- Apply before merging code that selects this column. Existing rows stay false.
alter table public.matches
  add column kickoff_time_tbd boolean not null default false;

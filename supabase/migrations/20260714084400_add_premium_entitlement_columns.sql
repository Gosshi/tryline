alter table public.user_profiles
  add column premium_until timestamptz,
  add column premium_source text
    check (premium_source in ('stripe', 'apple', 'manual'));

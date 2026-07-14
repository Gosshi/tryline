update public.user_profiles
set
  premium_until = coalesce(current_period_end, now() + interval '1 year'),
  premium_source = case
    when current_period_end is not null then 'stripe'
    else 'manual'
  end
where subscription_status = 'premium';

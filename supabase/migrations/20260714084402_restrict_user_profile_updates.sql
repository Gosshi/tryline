revoke update on table public.user_profiles from authenticated;

grant update (
  display_name,
  favorite_team_slugs,
  chat_daily_count,
  chat_daily_reset_date
) on table public.user_profiles to authenticated;

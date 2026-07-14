revoke update on table public.user_profiles from authenticated;

grant update (
  display_name,
  favorite_team_slugs
) on table public.user_profiles to authenticated;

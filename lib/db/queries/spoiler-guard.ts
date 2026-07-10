import { getSupabaseServerClientWithAuth } from "@/lib/auth/server";

export async function getSpoilerGuardEnabledForUser(
  userId: string | null | undefined,
): Promise<boolean> {
  if (!userId) {
    return false;
  }

  const client = await getSupabaseServerClientWithAuth();
  const { data, error } = await client
    .from("push_subscriptions")
    .select("spoiler_guard")
    .eq("user_id", userId);

  if (error) {
    return false;
  }

  return (data ?? []).some((subscription) => subscription.spoiler_guard);
}

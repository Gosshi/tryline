import { getSupabasePublicServerClient } from "@/lib/db/public-server";

export type TeamSummary = {
  country: string | null;
  name: string;
  slug: string;
};

export async function listAllTeams(): Promise<TeamSummary[]> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("teams")
    .select("slug, name, country")
    .order("name");

  if (error) {
    throw error;
  }

  return data ?? [];
}

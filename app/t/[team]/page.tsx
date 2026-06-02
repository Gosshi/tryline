import { notFound, permanentRedirect } from "next/navigation";

import { getTeamBySlug } from "@/lib/db/queries/teams";

type Props = {
  params: Promise<{ team: string }>;
};

export const revalidate = 60;

export default async function TeamRedirectPage({ params }: Props) {
  const { team } = await params;
  const teamData = await getTeamBySlug(team);

  if (!teamData) {
    notFound();
  }

  permanentRedirect(`/teams/${teamData.slug}`);
}

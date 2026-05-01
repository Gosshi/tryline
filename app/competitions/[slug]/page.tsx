import { redirect } from "next/navigation";

export default async function LegacyRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const match = slug.match(/^(.+)-(\d{4})$/);

  if (!match) {
    redirect("/");
  }

  redirect(`/c/${match[1]}/${match[2]}`);
}

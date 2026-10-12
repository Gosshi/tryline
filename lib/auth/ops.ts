import { notFound } from "next/navigation";

import { getUser } from "@/lib/auth/server";
import { SITE_URL } from "@/lib/site";

export async function requireOpsOwner() {
  const user = await getUser();
  const ownerIds = (process.env.OPS_OWNER_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (!user || !ownerIds.includes(user.id)) notFound();
  return user;
}

export async function authorizeOpsRequest(request: Request) {
  try {
    await requireOpsOwner();
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "digest" in error &&
      error.digest === "NEXT_HTTP_ERROR_FALLBACK;404"
    ) {
      return Response.json({ error: "not found" }, { status: 404 });
    }
    throw error;
  }
  if (request.headers.get("origin") !== new URL(SITE_URL).origin) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  return null;
}

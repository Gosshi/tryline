import { z } from "zod";

import {
  apiError,
  apiSuccess,
  PRIVATE_CACHE_CONTROL,
} from "@/lib/api/v1/response";
import { getUserFromBearer } from "@/lib/auth/bearer";
import { getSupabaseServerClient } from "@/lib/db/server";

const registerBodySchema = z.object({
  token: z.string().startsWith("ExponentPushToken["),
  team_slugs: z.array(z.string()).max(10),
  notify_prematch: z.boolean().optional().default(true),
  notify_content: z.boolean().optional().default(true),
  spoiler_guard: z.boolean().optional().default(true),
});

export async function POST(request: Request) {
  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch {
    return apiError("invalid json", 400, PRIVATE_CACHE_CONTROL);
  }

  const parsed = registerBodySchema.safeParse(rawBody);

  if (!parsed.success) {
    return apiError(
      "invalid push registration payload",
      400,
      PRIVATE_CACHE_CONTROL,
    );
  }

  const user = await getUserFromBearer(request);
  const client = getSupabaseServerClient();
  const { error } = await client.from("expo_push_tokens").upsert(
    {
      token: parsed.data.token,
      user_id: user?.id ?? null,
      team_slugs: parsed.data.team_slugs,
      notify_prematch: parsed.data.notify_prematch,
      notify_content: parsed.data.notify_content,
      spoiler_guard: parsed.data.spoiler_guard,
      last_used_at: new Date().toISOString(),
    },
    { onConflict: "token" },
  );

  if (error) {
    return apiError(error.message, 500, PRIVATE_CACHE_CONTROL);
  }

  return apiSuccess({ registered: true }, PRIVATE_CACHE_CONTROL);
}

import { z } from "zod";

import {
  apiError,
  apiSuccess,
  PRIVATE_CACHE_CONTROL,
} from "@/lib/api/v1/response";
import { getSupabaseServerClient } from "@/lib/db/server";

const unregisterBodySchema = z.object({
  token: z.string().startsWith("ExponentPushToken["),
});

export async function POST(request: Request) {
  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch {
    return apiError("invalid json", 400, PRIVATE_CACHE_CONTROL);
  }

  const parsed = unregisterBodySchema.safeParse(rawBody);

  if (!parsed.success) {
    return apiError(
      "invalid push unregister payload",
      400,
      PRIVATE_CACHE_CONTROL,
    );
  }

  const client = getSupabaseServerClient();
  const { error } = await client
    .from("expo_push_tokens")
    .delete()
    .eq("token", parsed.data.token);

  if (error) {
    return apiError(error.message, 500, PRIVATE_CACHE_CONTROL);
  }

  return apiSuccess({ unregistered: true }, PRIVATE_CACHE_CONTROL);
}

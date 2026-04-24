import { NextResponse } from "next/server";
import { z } from "zod";

import { assertCronAuthorized, CronUnauthorizedError } from "@/lib/cron/auth";
import { generateMatchContent } from "@/lib/llm/pipeline";

const bodySchema = z.object({
  matchIds: z.array(z.string().uuid()).min(1),
  contentType: z.enum(["preview", "recap"]),
});

export async function POST(request: Request) {
  try {
    assertCronAuthorized(request);

    const parsedBody = bodySchema.parse(await request.json());

    const results = [];

    for (const matchId of parsedBody.matchIds) {
      const result = await generateMatchContent(matchId, parsedBody.contentType);
      results.push(result);
    }

    return NextResponse.json({
      status: "ok",
      results,
    });
  } catch (error) {
    if (error instanceof CronUnauthorizedError) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "invalid_body", issues: error.issues }, { status: 400 });
    }

    console.error("[generate-content] failed", error);

    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

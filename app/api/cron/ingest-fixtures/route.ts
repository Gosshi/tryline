import { NextResponse } from "next/server";
import { z } from "zod";

import {
  PUBLIC_DATA_CACHE_TAGS,
  revalidatePublicData,
} from "@/lib/cache/public-data";
import { assertCronAuthorized, CronUnauthorizedError } from "@/lib/cron/auth";
import { FixtureIngestSafetyError } from "@/lib/ingestion/fixture-ingest-error";
import {
  ingestRwc2027Fixtures,
  ingestSixNations2027Fixtures,
} from "@/lib/ingestion/fixtures";

const bodySchema = z.object({
  dryRun: z.boolean().default(false),
  competition: z
    .enum(["six-nations-2027", "rwc-2027"])
    .default("six-nations-2027"),
});

async function parseOptionalBody(request: Request) {
  const text = await request.text();

  if (!text.trim()) {
    return bodySchema.parse({});
  }

  return bodySchema.parse(JSON.parse(text));
}

export async function POST(request: Request) {
  const startedAt = Date.now();

  try {
    assertCronAuthorized(request);

    const body = await parseOptionalBody(request);
    const result =
      body.competition === "rwc-2027"
        ? await ingestRwc2027Fixtures({ dryRun: body.dryRun })
        : await ingestSixNations2027Fixtures({ dryRun: body.dryRun });

    if (!body.dryRun) {
      revalidatePublicData(
        PUBLIC_DATA_CACHE_TAGS.competitions,
        PUBLIC_DATA_CACHE_TAGS.matches,
        PUBLIC_DATA_CACHE_TAGS.teams,
      );
    }

    return NextResponse.json({
      status: "ok",
      competition: result.competition,
      counts: result.counts,
      ...(result.dry_run ? { dry_run: result.dry_run } : {}),
      duration_ms: Date.now() - startedAt,
    });
  } catch (error) {
    if (error instanceof CronUnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "invalid_body", issues: error.issues },
        { status: 400 },
      );
    }

    if (error instanceof FixtureIngestSafetyError) {
      return NextResponse.json(
        { error: "Failed to ingest fixtures", reason: error.message },
        { status: 500 },
      );
    }

    console.error("Failed to ingest fixtures.", error);

    return NextResponse.json(
      { error: "Failed to ingest fixtures" },
      { status: 500 },
    );
  }
}

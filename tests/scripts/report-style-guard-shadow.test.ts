import { describe, expect, it, vi } from "vitest";

import {
  createStyleGuardShadowReport,
  runStyleGuardShadowReport,
} from "@/scripts/report-style-guard-shadow";


import type { Database } from "@/lib/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";

function createMockDb() {
  const builder = {
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({
      data: [
        {
          content_md: "定型句を含む文章です。ことが浮き彫りになった。",
          content_type: "recap",
          id: "content-1",
          qa_scores: { scores: { japanese_quality: 3 } },
        },
      ],
      error: null,
    }),
    order: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
  };

  return {
    from: vi.fn(() => builder),
  } as unknown as SupabaseClient<Database>;
}

describe("report-style-guard-shadow", () => {
  it("creates a per-article report and retry-equivalent total", () => {
    const report = createStyleGuardShadowReport(
      [
        {
          contentMd: "先行記事の本文です。\n\n結論です。",
          contentType: "preview",
          id: "first",
          japaneseQuality: 4,
        },
        {
          contentMd: "先行記事の本文です。\n\n結論です。",
          contentType: "preview",
          id: "second",
          japaneseQuality: 4,
        },
      ],
      "2026-07-20T00:00:00.000Z",
    );

    expect(report).toMatchObject({
      generatedAt: "2026-07-20T00:00:00.000Z",
      retryEquivalentCount: 1,
      total: 2,
    });
    expect(report.articles[1]?.result.similarity.thresholdExceeded).toBe(true);
  });

  it("loads up to the requested published Japanese preview and recap articles", async () => {
    const report = await runStyleGuardShadowReport(createMockDb(), 50);

    expect(report).toMatchObject({ retryEquivalentCount: 1, total: 1 });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const nextCacheMocks = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  unstableCache: vi.fn((fn: unknown) => fn),
}));

vi.mock("next/cache", () => ({
  revalidateTag: nextCacheMocks.revalidateTag,
  unstable_cache: nextCacheMocks.unstableCache,
}));

vi.mock("@/lib/db/public-server", () => ({
  getSupabasePublicServerClient: vi.fn(),
}));

import "@/lib/db/queries/competitions";
import "@/lib/db/queries/matches";
import "@/lib/db/queries/standings";
import "@/lib/db/queries/teams";
import {
  PUBLIC_DATA_CACHE_TAGS,
  revalidatePublicData,
} from "@/lib/cache/public-data";

describe("public data cache", () => {
  beforeEach(() => {
    nextCacheMocks.revalidateTag.mockClear();
  });

  it("configures public query caches with bounded TTLs and public tags", () => {
    expect(nextCacheMocks.unstableCache).toHaveBeenCalledWith(
      expect.any(Function),
      ["public-data", "teams"],
      expect.objectContaining({
        revalidate: 3600,
        tags: [PUBLIC_DATA_CACHE_TAGS.teams],
      }),
    );
    expect(nextCacheMocks.unstableCache).toHaveBeenCalledWith(
      expect.any(Function),
      ["public-data", "upcoming-matches"],
      expect.objectContaining({
        revalidate: 300,
        tags: [PUBLIC_DATA_CACHE_TAGS.matches],
      }),
    );
    expect(nextCacheMocks.unstableCache).toHaveBeenCalledWith(
      expect.any(Function),
      ["public-data", "standings"],
      expect.objectContaining({
        revalidate: 900,
        tags: [PUBLIC_DATA_CACHE_TAGS.standings],
      }),
    );
  });

  it("invalidates each requested public tag only once", () => {
    const result = revalidatePublicData(
      PUBLIC_DATA_CACHE_TAGS.matches,
      PUBLIC_DATA_CACHE_TAGS.matches,
      PUBLIC_DATA_CACHE_TAGS.standings,
    );

    expect(nextCacheMocks.revalidateTag).toHaveBeenCalledTimes(2);
    expect(nextCacheMocks.revalidateTag).toHaveBeenCalledWith(
      PUBLIC_DATA_CACHE_TAGS.matches,
    );
    expect(nextCacheMocks.revalidateTag).toHaveBeenCalledWith(
      PUBLIC_DATA_CACHE_TAGS.standings,
    );
    expect(result).toEqual({
      revalidatedTags: [
        PUBLIC_DATA_CACHE_TAGS.matches,
        PUBLIC_DATA_CACHE_TAGS.standings,
      ],
      skippedTags: [],
    });
  });

  it("warns and reports skipped tags when revalidation has no request context", () => {
    const error = new Error("Invariant: static generation store missing");
    nextCacheMocks.revalidateTag.mockImplementationOnce(() => {
      throw error;
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const result = revalidatePublicData(PUBLIC_DATA_CACHE_TAGS.content);

    expect(result).toEqual({
      revalidatedTags: [],
      skippedTags: [PUBLIC_DATA_CACHE_TAGS.content],
    });
    expect(warn).toHaveBeenCalledWith(
      "[public-data-cache] revalidation skipped",
      { error, tag: PUBLIC_DATA_CACHE_TAGS.content },
    );
    warn.mockRestore();
  });

  it("continues through non-context revalidation errors and later tags", () => {
    nextCacheMocks.revalidateTag
      .mockImplementationOnce(() => {
        throw new Error("unexpected cache failure");
      })
      .mockImplementationOnce(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const result = revalidatePublicData(
      PUBLIC_DATA_CACHE_TAGS.content,
      PUBLIC_DATA_CACHE_TAGS.matches,
    );

    expect(result).toEqual({
      revalidatedTags: [PUBLIC_DATA_CACHE_TAGS.matches],
      skippedTags: [PUBLIC_DATA_CACHE_TAGS.content],
    });
    expect(nextCacheMocks.revalidateTag).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});

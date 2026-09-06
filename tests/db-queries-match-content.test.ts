import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/lib/db/public-server", () => ({
  getSupabasePublicServerClient: () => dbMock,
}));

import {
  getContentStatusMap,
  getPublishedContentForMatch,
  listPublishedRecapsForFeed,
} from "@/lib/db/queries/match-content";

function createQuery() {
  const query = {
    eq: vi.fn(),
    in: vi.fn(),
    limit: vi.fn(),
    order: vi.fn(),
    select: vi.fn(),
  };

  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);

  return query;
}

describe("published match content queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("excludes draft recap content from match pages and the mobile content API", async () => {
    const query = createQuery();
    query.in.mockResolvedValue({ data: [], error: null });
    dbMock.from.mockReturnValue(query);

    await expect(getPublishedContentForMatch("match-1")).resolves.toEqual({
      preview: null,
      recap: null,
    });
    expect(query.eq).toHaveBeenCalledWith("status", "published");
  });

  it("excludes draft content from published-content status maps", async () => {
    const query = createQuery();
    query.in
      .mockReturnValueOnce(query)
      .mockResolvedValueOnce({ data: [], error: null });
    dbMock.from.mockReturnValue(query);

    await expect(getContentStatusMap(["match-1"])).resolves.toEqual(new Map());
    expect(query.eq).toHaveBeenCalledWith("status", "published");
  });

  it("excludes draft recaps from the RSS feed query", async () => {
    const query = createQuery();
    query.limit.mockResolvedValue({ data: [], error: null });
    dbMock.from.mockReturnValue(query);

    await expect(listPublishedRecapsForFeed()).resolves.toEqual([]);
    expect(query.eq).toHaveBeenCalledWith("status", "published");
  });
});

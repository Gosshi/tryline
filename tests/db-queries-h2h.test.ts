import { beforeEach, describe, expect, it, vi } from "vitest";

const clientMock = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/lib/db/public-server", () => ({
  getSupabasePublicServerClient: () => clientMock,
}));

import {
  listHeadToHeadPairs,
  mapHeadToHeadRowsToPairs,
  normalizeHeadToHeadSlug,
  parseHeadToHeadSlug,
} from "@/lib/db/queries/matches";

const leinster = {
  id: "team-1",
  name: "Leinster",
  short_code: "LEI",
  slug: "leinster",
};
const toulouse = {
  id: "team-2",
  name: "Stade Toulousain",
  short_code: "TLS",
  slug: "toulouse",
};
const bath = {
  id: "team-3",
  name: "Bath",
  short_code: "BAT",
  slug: "bath",
};

describe("head-to-head match queries", () => {
  beforeEach(() => {
    clientMock.from.mockReset();
  });

  it("normalizes pair slugs alphabetically", () => {
    expect(normalizeHeadToHeadSlug("toulouse", "leinster")).toBe(
      "leinster-vs-toulouse",
    );
    expect(parseHeadToHeadSlug("leinster-vs-toulouse")).toEqual({
      teamSlugA: "leinster",
      teamSlugB: "toulouse",
    });
    expect(parseHeadToHeadSlug("leinster")).toBeNull();
    expect(parseHeadToHeadSlug("leinster-vs-leinster")).toBeNull();
  });

  it("groups real match rows into canonical H2H pairs", () => {
    expect(
      mapHeadToHeadRowsToPairs([
        {
          away_team: toulouse,
          home_team: leinster,
          kickoff_at: "2025-05-01T12:00:00.000Z",
        },
        {
          away_team: leinster,
          home_team: toulouse,
          kickoff_at: "2026-05-01T12:00:00.000Z",
        },
        {
          away_team: bath,
          home_team: leinster,
          kickoff_at: "2026-01-01T12:00:00.000Z",
        },
        {
          away_team: null,
          home_team: leinster,
          kickoff_at: "2026-02-01T12:00:00.000Z",
        },
      ]),
    ).toEqual([
      {
        matchCount: 2,
        slug: "leinster-vs-toulouse",
        teamA: { name: "Leinster", shortCode: "LEI", slug: "leinster" },
        teamB: {
          name: "Stade Toulousain",
          shortCode: "TLS",
          slug: "toulouse",
        },
        updatedAt: "2026-05-01T12:00:00.000Z",
      },
      {
        matchCount: 1,
        slug: "bath-vs-leinster",
        teamA: { name: "Bath", shortCode: "BAT", slug: "bath" },
        teamB: { name: "Leinster", shortCode: "LEI", slug: "leinster" },
        updatedAt: "2026-01-01T12:00:00.000Z",
      },
    ]);
  });

  it("lists H2H pairs from stored matches", async () => {
    clientMock.from.mockReturnValue({
      select: vi.fn(() => ({
        order: vi.fn(() =>
          Promise.resolve({
            data: [
              {
                away_team: toulouse,
                home_team: leinster,
                kickoff_at: "2025-05-01T12:00:00.000Z",
              },
            ],
            error: null,
          }),
        ),
      })),
    });

    await expect(listHeadToHeadPairs()).resolves.toMatchObject([
      { slug: "leinster-vs-toulouse" },
    ]);
  });
});

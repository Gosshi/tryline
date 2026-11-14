import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";


const local = vi.hoisted(() => ({
  client: null as SupabaseClient<Database> | null,
}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/db/public-server", () => ({
  getSupabasePublicServerClient: () => {
    if (!local.client)
      throw new Error("Local Supabase test client is not ready");
    return local.client;
  },
}));

import {
  getNextUpcomingMatch,
  getRecentlyReviewedCompetitionGroups,
  getRecentlyReviewedFamilies,
  getUpcomingMatches,
} from "@/lib/db/queries/matches";

import { ensureSupabaseTestEnvironment } from "./db/helpers";

import type { Database } from "@/lib/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type ReviewRow = {
  match_id: string;
  match: { competition: { family: string } | null } | null;
};
const allJoins =
  "match_id,match:matches!match_content_match_id_fkey!inner(competition:competitions!matches_competition_id_fkey!inner(family))";
const fixtures: { reviews: string[]; scheduled: string[] } = {
  reviews: [],
  scheduled: [],
};
const requests: URL[] = [];
const counts = (rows: ReviewRow[]) =>
  Object.fromEntries(
    ["top-14", "urc", "premiership", "league-one"].map((family) => [
      family,
      rows.filter((row) => row.match?.competition?.family === family).length,
    ]),
  );

// CI starts a real local Supabase before pnpm test. A missing/broken stack must
// fail this test there; local runs without a stack skip it instead of using a mock.
describe.skipIf(!process.env.CI)(
  "real local Supabase retirement filters",
  () => {
    beforeAll(async () => {
      const status = ensureSupabaseTestEnvironment();
      expect(["127.0.0.1", "localhost", "[::1]"]).toContain(
        new URL(status.API_URL).hostname,
      );
      const options = {
        auth: { autoRefreshToken: false, persistSession: false },
      };
      const service = createClient<Database>(
        status.API_URL,
        status.SERVICE_ROLE_KEY,
        options,
      );
      local.client = createClient<Database>(status.API_URL, status.ANON_KEY, {
        ...options,
        global: {
          fetch: (input, init) => {
            requests.push(
              new URL(
                typeof input === "string"
                  ? input
                  : input instanceof URL
                    ? input.href
                    : input.url,
              ),
            );
            return fetch(input, init);
          },
        },
      });
      const prefix = `pr944-${randomUUID()}`;
      const { data: teams, error: teamError } = await service
        .from("teams")
        .insert([
          {
            slug: `${prefix}-home`,
            name: "Review fixture home",
            country: "JPN",
          },
          {
            slug: `${prefix}-away`,
            name: "Review fixture away",
            country: "JPN",
          },
        ])
        .select("id");
      if (teamError) throw teamError;
      const now = Date.now();
      let sequence = 0;
      for (const [family, count] of [
        ["top-14", 6],
        ["urc", 2],
        ["premiership", 2],
        ["league-one", 2],
      ] as const) {
        const { data: competition, error: competitionError } = await service
          .from("competitions")
          .insert({
            slug: `${prefix}-${family}`,
            family,
            name: `Review fixture ${family}`,
            season: "2026-27",
          })
          .select("id")
          .single();
        if (competitionError) throw competitionError;
        for (let i = 0; i < count; i++, sequence++) {
          for (const status of ["finished", "scheduled"] as const) {
            const id = randomUUID();
            const { error } = await service.from("matches").insert({
              id,
              competition_id: competition.id,
              home_team_id: teams[0]!.id,
              away_team_id: teams[1]!.id,
              status,
              kickoff_at: new Date(
                now +
                  (status === "scheduled" ? 60_000 : -86_400_000) +
                  sequence * 1_000,
              ).toISOString(),
              external_ids: { wikipedia_round: 1 },
            });
            if (error) throw error;
            fixtures[status === "scheduled" ? "scheduled" : "reviews"].push(id);
            if (status === "finished") {
              const { error: contentError } = await service
                .from("match_content")
                .insert({
                  match_id: id,
                  content_type: "recap",
                  language: "ja",
                  status: "published",
                  content_md: "Synthetic PostgREST regression fixture.",
                  model_version: "test-fixture",
                  prompt_version: "test-fixture",
                  qa_scores: {},
                  generated_at: new Date(
                    now + 86_400_000 - sequence * 1_000,
                  ).toISOString(),
                });
              if (contentError) throw contentError;
            }
          }
        }
      }
      // These unique fixtures live only in the ephemeral CI database. No existing
      // rows are updated or deleted, and no production credentials are used.
    }, 60_000);

    it("filters parents before the original limits and preserves every active fixture", async () => {
      const client = local.client!;
      const { data: baseline, error: baselineError } = await client
        .from("match_content")
        .select(allJoins)
        .in("match_id", fixtures.reviews);
      if (baselineError) throw baselineError;
      const { data: filtered, error: filteredError } = await client
        .from("match_content")
        .select(allJoins)
        .in("match_id", fixtures.reviews)
        .not("match.competition.family", "in", "(top-14)")
        .limit(40);
      if (filteredError) throw filteredError;
      expect(counts(baseline as ReviewRow[])).toEqual({
        "top-14": 6,
        urc: 2,
        premiership: 2,
        "league-one": 2,
      });
      expect(counts(filtered as ReviewRow[])).toEqual({
        "top-14": 0,
        urc: 2,
        premiership: 2,
        "league-one": 2,
      });
      expect(filtered).toHaveLength(6);

      for (const select of [
        allJoins.replace(
          "match_content_match_id_fkey!inner",
          "match_content_match_id_fkey",
        ),
        allJoins.replace(
          "matches_competition_id_fkey!inner",
          "matches_competition_id_fkey",
        ),
      ]) {
        const { data, error } = await client
          .from("match_content")
          .select(select)
          .in("match_id", fixtures.reviews)
          .not("match.competition.family", "in", "(top-14)")
          .limit(40);
        if (error) throw error;
        expect(data).toHaveLength(12);
        expect(
          (data as unknown as ReviewRow[]).filter(
            (row) => !row.match?.competition,
          ),
        ).toHaveLength(6);
      }

      requests.length = 0;
      const groups = await getRecentlyReviewedCompetitionGroups("ja");
      const reviewRequest = requests.find((url) =>
        url.pathname.endsWith("/match_content"),
      )!;
      expect(reviewRequest.searchParams.get("limit")).toBe("40");
      expect(reviewRequest.searchParams.get("match.competition.family")).toBe(
        "not.in.(top-14)",
      );
      const groupedIds = groups.flatMap((group) => [
        group.hero.id,
        ...group.compact.map((match) => match.id),
      ]);
      expect(
        groupedIds.filter((id) => fixtures.reviews.includes(id)).sort(),
      ).toEqual(fixtures.reviews.slice(6).sort());
      expect(
        groups.some((group) => group.competition.family === "top-14"),
      ).toBe(false);

      requests.length = 0;
      const families = await getRecentlyReviewedFamilies(5);
      expect(
        requests
          .find((url) => url.pathname.endsWith("/match_content"))!
          .searchParams.get("limit"),
      ).toBe("50");
      expect(families.map((row) => row.family)).toEqual(
        expect.arrayContaining(["urc", "premiership", "league-one"]),
      );
      expect(families.some((row) => row.family === "top-14")).toBe(false);

      const { data: scheduled, error: scheduledError } = await client
        .from("matches")
        .select(
          "id,competition:competitions!matches_competition_id_fkey!inner(family)",
        )
        .eq("status", "scheduled")
        .gte("kickoff_at", new Date().toISOString())
        .order("kickoff_at", { ascending: true });
      if (scheduledError) throw scheduledError;
      const expected = scheduled.filter(
        (row) => row.competition.family !== "top-14",
      );
      requests.length = 0;
      expect((await getUpcomingMatches(5)).map((row) => row.id)).toEqual(
        expected.slice(0, 5).map((row) => row.id),
      );
      expect(
        requests
          .find((url) => url.pathname.endsWith("/matches"))!
          .searchParams.get("limit"),
      ).toBe("5");
      requests.length = 0;
      expect((await getNextUpcomingMatch())?.id).toBe(expected[0]?.id);
      expect(
        requests
          .find((url) => url.pathname.endsWith("/matches"))!
          .searchParams.get("limit"),
      ).toBe("1");

      const { data: activeScheduled, error: activeScheduledError } =
        await client
          .from("matches")
          .select(
            "id,competition:competitions!matches_competition_id_fkey!inner(family)",
          )
          .in("id", fixtures.scheduled)
          .not("competition.family", "in", "(top-14)");
      if (activeScheduledError) throw activeScheduledError;
      expect(activeScheduled.map((row) => row.id).sort()).toEqual(
        fixtures.scheduled.slice(6).sort(),
      );
      console.info(
        "[pr944-real-postgrest]",
        JSON.stringify({
          runtime: "CI localhost Supabase",
          baselineReviews: counts(baseline as ReviewRow[]),
          filteredReviews: counts(filtered as ReviewRow[]),
          missingInnerParentRows: 12,
          missingInnerNullRelations: 6,
          activeScheduledFixtures: activeScheduled.length,
          productionLimits: {
            recentlyReviewed: 40,
            families: 50,
            upcoming: 5,
            next: 1,
          },
        }),
      );
    });
  },
);

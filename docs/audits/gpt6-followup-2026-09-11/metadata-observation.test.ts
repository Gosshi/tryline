import { expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({
  matches: [{
    id: "synthetic-match",
    homeTeam: { name: "Team A", nameJa: "チームA", slug: "team-a" },
    awayTeam: { name: "Team B", nameJa: "チームB", slug: "team-b" },
    kickoffAt: "2026-09-12T06:00:00.000Z",
    round: 1,
    status: "scheduled",
  }],
  standings: [{ teamName: "チームA" }],
}));

vi.mock("@/lib/db/queries/competitions", () => ({
  getCompetitionBySlug: async () => ({
    family: "urc", name: "URC", season: "2026-27",
    slug: "urc-2026-27", totalRounds: 18, matchCount: 1,
  }),
}));
vi.mock("@/lib/db/queries/matches", () => ({
  listMatchesForCompetition: async () => fixtures.matches,
}));
vi.mock("@/lib/db/queries/standings", () => ({
  getStandingsForCompetition: async () => fixtures.standings,
}));
vi.mock("@/lib/db/queries/match-content", () => ({
  getContentStatusForMatches: async () => ({}),
}));

it("labels a partial schedule as the complete competition and drops a known team", async () => {
  const { generateMetadata } = await import("@/app/c/[competition]/[season]/page");
  const { hasIncompleteSchedule } = await import("@/lib/format/schedule-coverage");
  expect(hasIncompleteSchedule({
    ingestedRegularSeasonFixtureCount: 1, ingestedRoundCount: 1,
    standingTeamCount: 1, totalRounds: 18,
  }).missingRounds).toBe(17);
  const metadata = await generateMetadata({
    params: Promise.resolve({ competition: "urc", season: "2026-27" }),
  });
  expect(metadata.description).toContain("チームAが参加する全1試合");
  expect(metadata.description).not.toContain("チームB");
});

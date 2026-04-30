import { beforeAll, describe, expect, it } from "vitest";

import { upsertMatchEvents } from "@/lib/ingestion/events";
import {
  ensureSupabaseTestEnvironment,
  insertMatchFixture,
} from "@/tests/db/helpers";

describe("upsertMatchEvents", () => {
  beforeAll(() => {
    const { API_URL, SERVICE_ROLE_KEY } = ensureSupabaseTestEnvironment();

    process.env.NEXT_PUBLIC_SUPABASE_URL = API_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
    process.env.OPENAI_API_KEY = "";
    process.env.SCRAPER_USER_AGENT = "Tryline Test Bot/1.0 (+test@example.com)";
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE_KEY;
    process.env.CRON_SECRET = "test-cron-secret";
    process.env.WIKIPEDIA_SQUAD_URL =
      "https://en.wikipedia.org/wiki/2025_Six_Nations_Championship_squads";
  });

  it("deletes existing rows before inserting and resolves unique partial player matches", async () => {
    const { awayTeamId, homeTeamId, matchId, service } =
      await insertMatchFixture();
    const { data: players, error: playersError } = await service
      .from("players")
      .insert([
        { team_id: homeTeamId, name: "Marcus Smith", position: "Fly-half" },
        { team_id: awayTeamId, name: "Finn Russell", position: "Fly-half" },
      ])
      .select("id, name");

    expect(playersError).toBeNull();

    const firstRun = await upsertMatchEvents({
      awayTeamId,
      events: [
        {
          type: "try",
          minute: 12,
          teamSide: "home",
          playerName: "Marcus",
          isPenaltyTry: false,
        },
        {
          type: "penalty_goal",
          minute: null,
          teamSide: "away",
          playerName: "Unknown Kicker",
          isPenaltyTry: false,
        },
      ],
      homeTeamId,
      matchId,
    });
    const secondRun = await upsertMatchEvents({
      awayTeamId,
      events: [
        {
          type: "try",
          minute: 30,
          teamSide: "home",
          playerName: "Marcus",
          isPenaltyTry: true,
        },
      ],
      homeTeamId,
      matchId,
    });

    expect(firstRun.inserted).toBe(2);
    expect(secondRun.inserted).toBe(1);

    const { data, error } = await service
      .from("match_events")
      .select("minute, player_id, metadata")
      .eq("match_id", matchId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]).toMatchObject({
      minute: 30,
      player_id: players?.find((player) => player.name === "Marcus Smith")?.id,
      metadata: {
        player_name: "Marcus",
        is_penalty_try: true,
      },
    });
  });
});

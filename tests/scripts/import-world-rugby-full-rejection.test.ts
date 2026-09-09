import { expect, it, vi } from "vitest";

import { assertEventInsertionAccepted } from "@/lib/ingestion/events";
import {
  importWorldRugbyMatchDetails,
  runCli,
} from "@/scripts/import-world-rugby-full";

it("reaches exit 1 through the World Rugby match loop when an insertion is rejected", async () => {
  const upsertMatchEvents = vi.fn().mockResolvedValue({
    inserted: 0,
    rejected: [{ detail: "synthetic", reason: "score_mismatch" }],
    warnings: [],
  });
  const exit = vi.fn(() => {
    throw new Error("exit");
  }) as unknown as (code: number) => never;
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

  await expect(
    runCli(
      () =>
        importWorldRugbyMatchDetails(
          [
            {
              competition_family: "pnc",
              world_rugby_match_id: "world-rugby-match",
            } as never,
          ],
          new Map([
            [
              "world-rugby-match",
              {
                away_team_id: "away",
                external_ids: {},
                home_team_id: "home",
                id: "match-rejected",
              },
            ],
          ]),
          async (_entry, match) => {
            const result = await upsertMatchEvents({ matchId: match.id });
            assertEventInsertionAccepted(result);
            return { eventsInserted: result.inserted, lineupsInserted: 0 };
          },
        ).then(() => undefined),
      exit,
    ),
  ).rejects.toThrow("exit");

  expect(upsertMatchEvents).toHaveBeenCalledWith({ matchId: "match-rejected" });
  expect(exit).toHaveBeenCalledWith(1);
  error.mockRestore();
});

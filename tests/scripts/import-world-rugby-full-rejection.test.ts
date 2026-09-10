import { expect, it, vi } from "vitest";

import { assertEventInsertionAccepted } from "@/lib/ingestion/events";
import {
  importWorldRugbyMatchDetails,
  runCli,
} from "@/scripts/import-world-rugby-full";

it("continues after a rejected World Rugby insertion before reaching exit 1", async () => {
  const upsertMatchEvents = vi
    .fn()
    .mockResolvedValueOnce({
      inserted: 0,
      rejected: [{ detail: "synthetic", reason: "score_mismatch" }],
      warnings: [],
    })
    .mockResolvedValueOnce({ inserted: 1, rejected: [], warnings: [] });
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
            {
              competition_family: "pnc",
              world_rugby_match_id: "world-rugby-match-normal",
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
            [
              "world-rugby-match-normal",
              {
                away_team_id: "away",
                external_ids: {},
                home_team_id: "home",
                id: "match-normal",
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
  expect(upsertMatchEvents).toHaveBeenCalledWith({ matchId: "match-normal" });
  expect(upsertMatchEvents).toHaveBeenCalledTimes(2);
  expect(exit).toHaveBeenCalledWith(1);
  error.mockRestore();
});

import { describe, expect, it, vi } from "vitest";

import { runCli as runPremiershipCli } from "@/scripts/backfill-premiership-match-events";
import { runCli as runTop14Cli } from "@/scripts/backfill-top14-match-events";
import { runCli as runUrcCli } from "@/scripts/backfill-urc-match-events";
import { runCli as runFillEventGapsCli } from "@/scripts/fill-event-gaps";
import { runCli as runWorldRugbyCli } from "@/scripts/import-world-rugby-full";

const runCliHandlers = [
  runFillEventGapsCli,
  runTop14Cli,
  runPremiershipCli,
  runUrcCli,
  runWorldRugbyCli,
];

describe("event insertion rejection CLI propagation", () => {
  it.each(runCliHandlers)("exits non-zero when a rejection reaches the CLI", async (runCli) => {
    const exit = vi.fn(() => {
      throw new Error("exit");
    }) as unknown as (code: number) => never;
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      runCli(
        async () => {
          throw new Error("Event insertion rejected: score_mismatch: synthetic");
        },
        exit,
      ),
    ).rejects.toThrow("exit");

    expect(exit).toHaveBeenCalledWith(1);
    error.mockRestore();
  });
});

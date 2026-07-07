#!/usr/bin/env tsx

import {
  buildWorldRankingTeamLookup,
  loadRankingTeams,
  upsertTeamWorldRankings,
} from "@/lib/ingestion/world-rankings";
import { scrapeWorldRugbyRankings } from "@/lib/scrapers/wikipedia-world-rankings";

function parseArgs(argv: string[]) {
  return {
    confirmOwnerApproved: argv.includes("--confirm-owner-approved"),
    dryRun: !argv.includes("--confirm-owner-approved"),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const rows = await scrapeWorldRugbyRankings();
  const teams = await loadRankingTeams();
  const teamLookup = buildWorldRankingTeamLookup(rows, teams);
  const unmatched = rows
    .filter((row) => !teamLookup[row.teamName])
    .map((row) => row.teamName);

  console.log(
    `World Rugby rankings: parsed=${rows.length} matched=${rows.length - unmatched.length} unmatched=${unmatched.length}`,
  );

  if (unmatched.length > 0) {
    console.warn(`Unmatched teams: ${unmatched.join(", ")}`);
  }

  if (options.dryRun) {
    console.log("[dry-run] No team rankings were updated.");
    console.log("Execution requires Owner approval and --confirm-owner-approved.");
    return;
  }

  if (!options.confirmOwnerApproved) {
    throw new Error("Owner approval is required for non-dry-run execution.");
  }

  const result = await upsertTeamWorldRankings({ rows, teamLookup });

  console.log(
    `World Rugby rankings updated: updated=${result.updated} unmatched=${result.unmatched.length}`,
  );
}

if (process.argv[1]?.endsWith("ingest-world-rankings.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

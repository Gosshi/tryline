import { describe, expect, it } from "vitest";

import {
  extractEventHtml,
  findEventBlockByTeams,
} from "@/lib/ingestion/wikipedia-event-block";

describe("Wikipedia event block selection", () => {
  const page = `
    <div class="vevent" id="Home_v_Away">
      <span>Home national rugby union team</span>
      <span>Away national rugby union team</span>
      <span>1 February 2026</span>
      <table><tr><td>Home</td><td>Try: Player A 10'</td></tr></table>
    </div>
    <div class="vevent" id="Other_v_Teams">
      <span>Other national rugby union team</span>
      <span>Teams national rugby union team</span>
      <span>2 February 2026</span>
      <table><tr><td>Other</td><td>Try: Player B 20'</td></tr></table>
    </div>`;

  it("returns only the team and date matching event block", () => {
    const block = findEventBlockByTeams(
      page,
      "Home",
      "Away",
      "2026-02-01",
    );
    expect(block).toContain('id="Home_v_Away"');
    expect(block).not.toContain('id="Other_v_Teams"');
  });

  it("does not treat the page content container as an event id", () => {
    expect(extractEventHtml(page, "mw-content-text")).toBeNull();
    expect(extractEventHtml(page, "missing-event")).toBeNull();
  });

  it("returns null when no team and date block matches", () => {
    expect(
      findEventBlockByTeams(page, "Unknown", "Visitors", "2026-02-01"),
    ).toBeNull();
  });
});

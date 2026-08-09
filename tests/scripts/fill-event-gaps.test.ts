import { describe, expect, it, vi } from "vitest";

import {
  buildLeagueOneEnglishUrl,
  eventTotalsExceedFinalScore,
  extractEventHtml,
  findEventBlockByTeams,
  loadGapMatches,
} from "@/scripts/fill-event-gaps";

import type { ParsedMatchEvent } from "@/lib/scrapers/wikipedia-match-events";

const HTML = `
  <html>
    <body>
      <div id="first">first match</div>
      <div id="target"><table><tr><td>target match</td></tr></table></div>
    </body>
  </html>
`;

const VEVENT_HTML = `
  <html>
    <body>
      <div class="vevent summary">
        <div>1 November 2025</div>
        <a href="/wiki/England_national_rugby_union_team">England</a>
        <a href="/wiki/Australia_national_rugby_union_team">Australia</a>
        <table><tr><td>England v Australia events</td></tr></table>
      </div>
      <div class="vevent summary">
        <div>8 November 2025</div>
        <a href="/wiki/France_national_rugby_union_team">France</a>
        <a href="/wiki/Australia_national_rugby_union_team">Australia</a>
        <table><tr><td>France v Australia events</td></tr></table>
      </div>
    </body>
  </html>
`;

const DUPLICATE_TEAMS_HTML = `
  <html>
    <body>
      <div class="vevent summary">
        <div>1 November 2025</div>
        <a>England</a>
        <a>Australia</a>
        <table><tr><td>first match</td></tr></table>
      </div>
      <div class="vevent summary">
        <div>8 November 2025</div>
        <a>England</a>
        <a>Australia</a>
        <table><tr><td>second match</td></tr></table>
      </div>
    </body>
  </html>
`;

const NATIONAL_TEAM_LINK_HTML = `
  <html>
    <body>
      <div class="vevent summary">
        <div>22 November 2025</div>
        <a title="England national rugby union team">England</a>
        <a title="Fiji national rugby union team">Fiji</a>
        <div>Referee: Example Official (Australia)</div>
        <table><tr><td>England v Fiji events</td></tr></table>
      </div>
      <div class="vevent summary">
        <div>22 November 2025</div>
        <a title="Australia national rugby union team">Australia</a>
        <a title="France national rugby union team">France</a>
        <table><tr><td>Australia v France events</td></tr></table>
      </div>
    </body>
  </html>
`;

const CLUB_TEAM_HTML = `
  <html>
    <body>
      <div class="vevent summary">
        <div>1 June 2026</div>
        <span>Kobe Steelers</span>
        <span>Kubota Spears</span>
        <table><tr><td>Kobe v Kubota events</td></tr></table>
      </div>
    </body>
  </html>
`;

describe("fill-event-gaps safeguards", () => {
  it("extracts the matching event anchor html", () => {
    const html = extractEventHtml(HTML, "target");

    expect(html).toContain("target match");
    expect(html).not.toContain("first match");
  });

  it("returns null for missing, generic, or absent event ids", () => {
    expect(extractEventHtml(HTML, "missing")).toBeNull();
    expect(extractEventHtml(HTML, "mw-content-text")).toBeNull();
    expect(extractEventHtml(HTML, null)).toBeNull();
  });

  it("detects parsed event totals that exceed the final score", () => {
    const events: ParsedMatchEvent[] = [
      {
        isPenaltyTry: false,
        minute: 10,
        playerName: "Try Scorer",
        teamSide: "home",
        type: "try",
      },
      {
        isPenaltyTry: false,
        minute: 11,
        playerName: "Kicker",
        teamSide: "home",
        type: "conversion",
      },
    ];

    expect(
      eventTotalsExceedFinalScore(events, {
        away_score: 0,
        home_score: 5,
      }),
    ).toEqual({
      awayTotal: 0,
      exceeds: true,
      homeTotal: 7,
    });
  });

  it("allows normal data and null final scores", () => {
    const events: ParsedMatchEvent[] = [
      {
        isPenaltyTry: false,
        minute: 10,
        playerName: "Try Scorer",
        teamSide: "away",
        type: "try",
      },
    ];

    expect(
      eventTotalsExceedFinalScore(events, {
        away_score: 7,
        home_score: 0,
      }).exceeds,
    ).toBe(false);
    expect(
      eventTotalsExceedFinalScore(events, {
        away_score: null,
        home_score: null,
      }).exceeds,
    ).toBe(false);
  });

  it("selects the only vevent that contains both team names", () => {
    const html = findEventBlockByTeams(
      VEVENT_HTML,
      "England",
      "Australia",
      "2025-11-01",
    );

    expect(html).toContain("England v Australia events");
    expect(html).not.toContain("France v Australia events");
  });

  it("matches national team link titles before loose text matching", () => {
    const html = findEventBlockByTeams(
      NATIONAL_TEAM_LINK_HTML,
      "England",
      "Fiji",
      "2025-11-22",
    );

    expect(html).toContain("England v Fiji events");
    expect(html).not.toContain("Australia v France events");
  });

  it("does not treat a referee nationality as a team matchup", () => {
    const html = findEventBlockByTeams(
      NATIONAL_TEAM_LINK_HTML,
      "Australia",
      "Fiji",
      "2025-11-22",
    );

    expect(html).toBeNull();
  });

  it("falls back to loose matching for club team blocks", () => {
    const html = findEventBlockByTeams(
      CLUB_TEAM_HTML,
      "Kobe Steelers",
      "Kubota Spears",
      "2026-06-01",
    );

    expect(html).toContain("Kobe v Kubota events");
  });

  it("returns null when no vevent contains both team names", () => {
    expect(
      findEventBlockByTeams(VEVENT_HTML, "England", "Japan", "2025-11-01"),
    ).toBeNull();
  });

  it("uses the kickoff date to disambiguate repeated team matchups", () => {
    const html = findEventBlockByTeams(
      DUPLICATE_TEAMS_HTML,
      "England",
      "Australia",
      "2025-11-08",
    );

    expect(html).toContain("second match");
    expect(html).not.toContain("first match");
  });

  it("returns null when repeated team matchups cannot be disambiguated by date", () => {
    expect(
      findEventBlockByTeams(
        DUPLICATE_TEAMS_HTML,
        "England",
        "Australia",
        "2025-11-04",
      ),
    ).toBeNull();
  });
});

describe("buildLeagueOneEnglishUrl", () => {
  it("encodes the season range with an en dash", () => {
    expect(buildLeagueOneEnglishUrl("2024-25")).toBe(
      "https://en.wikipedia.org/wiki/2024%E2%80%9325_Japan_Rugby_League_One_%E2%80%93_Division_1",
    );
  });

  it("returns null for unexpected season formats", () => {
    expect(buildLeagueOneEnglishUrl("2024")).toBeNull();
  });
});

describe("loadGapMatches", () => {
  it("filters gaps in the database and orders them from oldest kickoff", async () => {
    const query = {
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve(
          resolve({
            data: [
              {
                external_ids: {
                  wikipedia_url: "https://en.wikipedia.org/wiki/example",
                },
                match_events: [],
              },
            ],
            error: null,
          }),
        ),
    };
    const client = {
      from: vi.fn(() => query),
    };

    await expect(loadGapMatches(50, client as never)).resolves.toHaveLength(1);

    expect(client.from).toHaveBeenCalledWith("matches");
    expect(query.select).toHaveBeenCalledWith(
      expect.stringContaining("match_events!left(id)"),
    );
    expect(query.is).toHaveBeenCalledWith("match_events.id", null);
    expect(query.order).toHaveBeenCalledWith("kickoff_at", { ascending: true });
    expect(query.limit).toHaveBeenCalledWith(50);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

const fetcherMock = vi.hoisted(() => ({
  fetchWithPolicy: vi.fn(),
}));

vi.mock("@/lib/scrapers/fetcher", () => fetcherMock);

import {
  fetchLipovitanChallengeCup2026EventMatches,
  parseLipovitanChallengeCupEventHtml,
} from "@/lib/ingestion/sources/wikipedia-lipovitan-challenge-cup-events";
import { FetchError } from "@/lib/scrapers/errors";

const EVENT_HTML = `
  <div class="mw-heading mw-heading2"><h2 id="Fixtures">Fixtures</h2></div>
  <div class="mw-heading mw-heading3"><h3 id="Test_1">Test 1</h3></div>
  <div class="vevent summary" id="Japan_v_Australia">
    <table><tbody><tr><td>8 August 2026<br />19:05 JST</td></tr></tbody></table>
    <table><tbody>
      <tr>
        <td class="vcard"><span class="fn org"><a>Japan</a></span></td>
        <td>32–35</td>
        <td class="vcard"><span class="fn org"><a>Australia</a></span></td>
      </tr>
      <tr style="font-size:85%">
        <td><b>Try:</b> <a>Japan Scorer</a> 10'</td>
        <td></td>
        <td><b>Try:</b> <a>Australia Scorer</a> 12'</td>
      </tr>
    </table>
  </div>
`;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Lipovitan Challenge Cup event source", () => {
  it("returns non-empty event HTML keyed to the schedule source match", () => {
    const [eventMatch] = parseLipovitanChallengeCupEventHtml(EVENT_HTML);
    const scheduleMatchKey = "japan:australia";

    expect(eventMatch).toMatchObject({
      awayTeamSlug: "australia",
      homeTeamSlug: "japan",
      status: "finished",
    });
    expect(`${eventMatch?.homeTeamSlug}:${eventMatch?.awayTeamSlug}`).toBe(
      scheduleMatchKey,
    );
    expect(eventMatch?.rawHtml).toContain("Japan_v_Australia");
  });

  it("returns no event matches when the English Wikipedia page is missing", async () => {
    fetcherMock.fetchWithPolicy.mockRejectedValue(
      new FetchError({
        attempt: 1,
        status: 404,
        url: "https://en.wikipedia.org/wiki/missing",
      }),
    );

    await expect(fetchLipovitanChallengeCup2026EventMatches()).resolves.toEqual(
      [],
    );
  });
});

import { describe, expect, it } from "vitest";

import { parseWikipediaSeasonMatches } from "@/lib/scrapers/wikipedia-season-parser";
import {
  mapWikipediaTeamName,
  normalizeWikipediaTeamName,
} from "@/lib/scrapers/wikipedia-team-name-map";

const seasonHtml = `
<div class="vevent summary" id="Bath_v_Saracens">
  <table><tbody><tr><td><time datetime="2025-09-26">26 September 2025</time></td></tr></tbody></table>
  <table>
    <tbody>
      <tr>
        <td class="vcard"><a href="/wiki/Bath_Rugby">Bath</a></td>
        <td>20–15</td>
        <td class="vcard"><a href="/wiki/Saracens_F.C.">Saracens</a></td>
      </tr>
    </tbody>
  </table>
</div>
<div class="vevent summary" id="Gloucester_v_Sale">
  <table><tbody><tr><td><abbr class="dtstart" title="2025-10-04">4 October 2025</abbr></td></tr></tbody></table>
  <table>
    <tbody>
      <tr>
        <td><a href="/wiki/Gloucester_Rugby">Gloucester</a></td>
        <td>18-12</td>
        <td><a href="/wiki/Sale_Sharks">Sale</a></td>
      </tr>
    </tbody>
  </table>
</div>
`;

const playoffHtml = `
<div id="mw-content-text">
  <div class="vevent summary">
    <table><tbody><tr><td><time datetime="2024-06-14">14 June 2024</time></td></tr></tbody></table>
    <div class="vcard"><span class="fn">Bayonne (4)</span></div>
    <div class="vcard"><span class="fn">(5) Clermont</span></div>
  </div>
</div>
`;

const genericContainerHtml = `
<div id="mw-content-text">
  <div class="vevent summary">
    <table><tbody><tr><td><time datetime="2024-10-04">4 October 2024</time></td></tr></tbody></table>
    <table>
      <tbody>
        <tr>
          <td><a href="/wiki/Bath_Rugby">Bath</a></td>
          <td>20-15</td>
          <td><a href="/wiki/Saracens_F.C.">Saracens</a></td>
        </tr>
      </tbody>
    </table>
  </div>
</div>
`;

describe("Wikipedia season parser", () => {
  it("extracts vevent team names, dates, and section ids", () => {
    expect(parseWikipediaSeasonMatches(seasonHtml)).toEqual([
      {
        awayTeamName: "Saracens",
        dateKey: "2025-09-26",
        dateText: "2025-09-26",
        homeTeamName: "Bath",
        sectionId: "Bath_v_Saracens",
      },
      {
        awayTeamName: "Sale",
        dateKey: "2025-10-04",
        dateText: "2025-10-04",
        homeTeamName: "Gloucester",
        sectionId: "Gloucester_v_Sale",
      },
    ]);
  });

  it("normalizes and maps Wikipedia team names to DB team names", () => {
    expect(normalizeWikipediaTeamName("Gloucester [a]")).toBe("Gloucester");
    expect(mapWikipediaTeamName("Gloucester")).toBe("Gloucester Rugby");
    expect(mapWikipediaTeamName("Sale")).toBe("Sale Sharks");
    expect(mapWikipediaTeamName("Bath")).toBe("Bath");
  });

  it("strips playoff seed numbers from .fn team names", () => {
    expect(parseWikipediaSeasonMatches(playoffHtml)).toEqual([
      {
        awayTeamName: "Clermont",
        dateKey: "2024-06-14",
        dateText: "2024-06-14",
        homeTeamName: "Bayonne",
        sectionId: null,
      },
    ]);
  });

  it("ignores generic wikipedia container ids when resolving section id", () => {
    expect(parseWikipediaSeasonMatches(genericContainerHtml)).toEqual([
      {
        awayTeamName: "Saracens",
        dateKey: "2024-10-04",
        dateText: "2024-10-04",
        homeTeamName: "Bath",
        sectionId: null,
      },
    ]);
  });
});

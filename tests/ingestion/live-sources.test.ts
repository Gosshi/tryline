import { beforeEach, describe, expect, it, vi } from "vitest";

const fetcherMock = vi.hoisted(() => ({
  fetchWithPolicy: vi.fn(),
}));

vi.mock("@/lib/scrapers/fetcher", () => fetcherMock);

import { LIVE_COMPETITION_SOURCES } from "@/lib/ingestion/live-competitions";
import { parseLeagueOneLiveHtml } from "@/lib/ingestion/sources/league-one-live";
import { parseAutumnNationsLiveHtml } from "@/lib/ingestion/sources/wikipedia-autumn-nations";
import {
  fetchGreatestRivalry2026,
  parseGreatestRivalryLiveHtml,
} from "@/lib/ingestion/sources/wikipedia-greatest-rivalry";
import { fetchLipovitanChallengeCup2026 } from "@/lib/ingestion/sources/wikipedia-lipovitan-challenge-cup";
import { fetchLipovitanChallengeCup2026EventMatches } from "@/lib/ingestion/sources/wikipedia-lipovitan-challenge-cup-events";
import {
  fetchNationsChampionship2026,
  parseNationsChampionshipLiveHtml,
} from "@/lib/ingestion/sources/wikipedia-nations-championship";
import {
  fetchNationsChampionship2026EventMatches,
  NATIONS_CHAMPIONSHIP_SOUTHERN_HEMISPHERE_URL,
  parseNationsChampionshipEventHtml,
} from "@/lib/ingestion/sources/wikipedia-nations-championship-events";
import { parsePncLiveHtml } from "@/lib/ingestion/sources/wikipedia-pnc";
import {
  fetchPremiership,
  parsePremiershipLiveHtml,
} from "@/lib/ingestion/sources/wikipedia-premiership";
import { parseRugbyChampionshipLiveHtml } from "@/lib/ingestion/sources/wikipedia-rugby-championship";
import {
  fetchSixNations2027,
  parseSixNations2027LiveHtml,
} from "@/lib/ingestion/sources/wikipedia-six-nations-2027-live";
import { parseSuperRugbyPacificLiveHtml } from "@/lib/ingestion/sources/wikipedia-super-rugby-pacific";
import {
  fetchTop14,
  parseTop14LiveHtml,
} from "@/lib/ingestion/sources/wikipedia-top-14";
import {
  fetchUrc,
  parseUrcLiveHtml,
} from "@/lib/ingestion/sources/wikipedia-urc";
import { parseWorldRugbyNationsChampionshipSchedulePayload } from "@/lib/ingestion/sources/world-rugby-nations-championship-times";
import { FetchError } from "@/lib/scrapers/errors";

const PREMIERSHIP_HTML = `
<div class="mw-heading mw-heading2"><h2 id="Regular_season">Regular season</h2></div>
<div class="mw-heading mw-heading3"><h3 id="Round_1">Round 1</h3></div>
<div class="vevent summary" id="Bath_v_Bristol_Bears">
  <table><tbody><tr><td>20 September 2025<br />19:45</td></tr></tbody></table>
  <table><tbody><tr>
    <td class="vcard"><span class="fn org"><a>Bath</a></span></td>
    <td>v</td>
    <td class="vcard"><span class="fn org"><a>Bristol Bears</a></span></td>
  </tr></tbody></table>
  <table><tbody><tr><td><span class="location">The Recreation Ground</span></td></tr></tbody></table>
</div>
<div class="vevent summary" id="Saracens_v_Sale_Sharks">
  <table><tbody><tr><td>21 September 2025<br />15:00</td></tr></tbody></table>
  <table><tbody><tr>
    <td class="vcard"><span class="fn org"><a>Saracens</a></span></td>
    <td>28–17</td>
    <td class="vcard"><span class="fn org"><a>Sale Sharks</a></span></td>
  </tr></tbody></table>
  <table><tbody><tr><td><span class="location">StoneX Stadium</span></td></tr></tbody></table>
</div>
<div class="mw-heading mw-heading2"><h2 id="Play-offs">Play-offs</h2></div>
<div class="mw-heading mw-heading3"><h3 id="Final">Final</h3></div>
<div class="vevent summary" id="Bath_v_Saracens">
  <table><tbody><tr><td>20 June 2026<br />15:00</td></tr></tbody></table>
  <table><tbody><tr>
    <td class="vcard"><span class="fn org"><a>Bath</a></span></td>
    <td>28–17</td>
    <td class="vcard"><span class="fn org"><a>Saracens</a></span></td>
  </tr></tbody></table>
  <table><tbody><tr><td><span class="location">Twickenham Stadium</span></td></tr></tbody></table>
</div>
`;

const SIX_NATIONS_2027_HTML = `
<div class="mw-heading mw-heading2"><h2 id="Fixtures">Fixtures</h2></div>
<div class="mw-heading mw-heading3"><h3 id="Round_1">Round 1</h3></div>
<div class="vevent summary" id="Ireland_v_England">
  <table><tbody><tr><td>5 February 2027<br />20:10 GMT</td></tr></tbody></table>
  <table><tbody><tr>
    <td class="vcard"><span class="fn org"><a>Ireland</a></span></td>
    <td>v</td>
    <td class="vcard"><span class="fn org"><a>England</a></span></td>
  </tr></tbody></table>
  <table><tbody><tr><td><span class="location">Aviva Stadium</span></td></tr></tbody></table>
</div>
<div class="vevent summary" id="France_v_Wales">
  <table><tbody><tr><td>6 February 2027<br />17:40 CET</td></tr></tbody></table>
  <table><tbody><tr>
    <td class="vcard"><span class="fn org"><a>France</a></span></td>
    <td>27–13</td>
    <td class="vcard"><span class="fn org"><a>Wales</a></span></td>
  </tr></tbody></table>
  <table><tbody><tr><td><span class="location">Stade de France</span></td></tr></tbody></table>
</div>
`;

const PNC_HTML = `
<div class="mw-heading mw-heading2"><h2 id="Pool_A">Pool A</h2></div>
<div class="vevent summary" id="Japan_v_Fiji">
  <table><tbody><tr><td>1 September 2026<br />19:00 JST</td></tr></tbody></table>
  <table><tbody><tr>
    <td class="vcard"><span class="fn org"><a>Japan</a></span></td>
    <td>v</td>
    <td class="vcard"><span class="fn org"><a>Fiji</a></span></td>
  </tr></tbody></table>
  <table><tbody><tr><td><span class="location">Tokyo</span></td></tr></tbody></table>
</div>
`;

const PNC_PARSOID_HTML = `
<div class="mw-heading mw-heading2"><h2 id="Pool_A">Pool A</h2></div>
<section data-mw-section-id="3" aria-labelledby="Japan_v_Fiji">
  <div class="vevent summary" id="Japan_v_Fiji">
    <table><tbody><tr><td>1 September 2026<br />19:00 JST</td></tr></tbody></table>
    <table><tbody><tr>
      <td class="vcard"><span class="fn org"><a>Japan</a></span></td>
      <td>v</td>
      <td class="vcard"><span class="fn org"><a>Fiji</a></span></td>
    </tr></tbody></table>
    <table><tbody><tr><td><span class="location">Tokyo</span></td></tr></tbody></table>
  </div>
</section>
<div class="mw-heading mw-heading2"><h2 id="References">References</h2></div>
`;

const PNC_CONDENSED_2026_HTML = `
<div class="mw-heading mw-heading2"><h2 id="Bracket">Bracket</h2></div>
<div class="mw-heading mw-heading3"><h3 id="Semi-finals">Semi-finals</h3></div>
<div class="vevent summary" id="Fiji_v_Canada">
  <table><tbody><tr><td>12 September 2026<br />16:00 JST (UTC+09)</td></tr></tbody></table>
  <table><tbody><tr>
    <td class="vcard"><span class="fn org"><a>Fiji</a></span></td>
    <td>v</td>
    <td class="vcard"><span class="fn org"><a>Canada</a></span></td>
  </tr></tbody></table>
  <table><tbody><tr><td><span class="location">Hanazono Rugby Stadium, Higashiōsaka</span></td></tr></tbody></table>
</div>
<div class="vevent summary" id="Japan_v_United_States">
  <table><tbody><tr><td>12 September 2026<br />19:05 JST (UTC+09)</td></tr></tbody></table>
  <table><tbody><tr>
    <td class="vcard"><span class="fn org"><a>Japan</a></span></td>
    <td>v</td>
    <td class="vcard"><span class="fn org"><a>United States</a></span></td>
  </tr></tbody></table>
  <table><tbody><tr><td><span class="location">Hanazono Rugby Stadium, Higashiōsaka</span></td></tr></tbody></table>
</div>
<div class="mw-heading mw-heading3"><h3 id="Third_place_play-off">Third place play-off</h3></div>
<div class="vevent summary" id="Loser_SF1_v_Loser_SF2">
  <table><tbody><tr><td>19 September 2026<br />16:00 JST (UTC+09)</td></tr></tbody></table>
  <table><tbody><tr>
    <td class="vcard"><span class="fn org">Loser SF1</span></td>
    <td>v</td>
    <td class="vcard"><span class="fn org">Loser SF2</span></td>
  </tr></tbody></table>
  <table><tbody><tr><td><span class="location">Chichibunomiya Rugby Stadium, Tokyo</span></td></tr></tbody></table>
</div>
<div class="mw-heading mw-heading3"><h3 id="Grand_Final">Grand Final</h3></div>
<div class="vevent summary" id="Winner_SF1_v_Winner_SF2">
  <table><tbody><tr><td>19 September 2026<br />19:05 JST (UTC+09)</td></tr></tbody></table>
  <table><tbody><tr>
    <td class="vcard"><span class="fn org">Winner SF1</span></td>
    <td>v</td>
    <td class="vcard"><span class="fn org">Winner SF2</span></td>
  </tr></tbody></table>
  <table><tbody><tr><td><span class="location">Chichibunomiya Rugby Stadium, Tokyo</span></td></tr></tbody></table>
</div>
`;

const NATIONS_CHAMPIONSHIP_HTML = `
<div class="mw-heading mw-heading2"><h2 id="Fixtures">Fixtures</h2></div>
<div class="mw-heading mw-heading3"><h3 id="Southern_Hemisphere_Series">Southern Hemisphere Series</h3></div>
<div class="mw-heading mw-heading4"><h4 id="Round_1">Round 1<span class="mw-editsection">[edit]</span></h4></div>
<table>
  <tbody>
    <tr><th></th><th></th><th></th><th></th><th></th></tr>
    <tr>
      <td>4 July 2026</td>
      <td>Japan</td>
      <td>v</td>
      <td>Italy</td>
      <td>Chichibunomiya Rugby Stadium, Tokyo</td>
    </tr>
    <tr>
      <td>4 July 2026</td>
      <td>New Zealand</td>
      <td>31-20</td>
      <td>France</td>
      <td>Te Kaha, Christchurch</td>
    </tr>
  </tbody>
</table>
<div class="mw-heading mw-heading4"><h4 id="Round_2">Round 2<span class="mw-editsection">[edit]</span></h4></div>
<table>
  <tbody>
    <tr><th></th><th></th><th></th><th></th><th></th></tr>
    <tr>
      <td>11 July 2026</td>
      <td>Japan</td>
      <td>v</td>
      <td>Ireland</td>
      <td>Newcastle International Sports Centre, Newcastle, Australia</td>
    </tr>
  </tbody>
</table>
<div class="mw-heading mw-heading3"><h3 id="Finals">Finals</h3></div>
<div class="vevent summary" id="Northern_6_v_Southern_6">
  <table><tbody><tr><td>27 November 2026<br />16:40 GMT</td></tr></tbody></table>
  <table><tbody><tr>
    <td class="vcard"><span class="fn org">Northern 6</span></td>
    <td>v</td>
    <td class="vcard"><span class="fn org">Southern 6</span></td>
  </tr></tbody></table>
  <table><tbody><tr><td><span class="location">Twickenham Stadium, London</span></td></tr></tbody></table>
</div>
`;

const NATIONS_CHAMPIONSHIP_EDIT_SOURCE_HTML = `
<div class="mw-heading mw-heading2"><h2 id="Fixtures">Fixtures<span class="mw-editsection">[edit source]</span></h2></div>
<div class="mw-heading mw-heading4"><h4 id="Round_3">Round 3<span class="mw-editsection">[edit source]</span></h4></div>
<table>
  <tbody>
    <tr><th></th><th></th><th></th><th></th><th></th></tr>
    <tr><td>18 July 2026</td><td>Australia</td><td>57-10</td><td>Italy</td><td>Perth Stadium</td></tr>
    <tr><td>18 July 2026</td><td>Fiji</td><td>17-33</td><td>Scotland</td><td>HFC Bank Stadium</td></tr>
    <tr><td>18 July 2026</td><td>South Africa</td><td>43-0</td><td>Wales</td><td>Loftus Versfeld</td></tr>
    <tr><td>18 July 2026</td><td>Argentina</td><td>24-31</td><td>England</td><td>Estadio Mario Alberto Kempes</td></tr>
    <tr><td>18 July 2026</td><td>Japan</td><td>20-36</td><td>France</td><td>Japan National Stadium</td></tr>
    <tr><td>18 July 2026</td><td>New Zealand</td><td>27-21</td><td>Ireland</td><td>Eden Park</td></tr>
  </tbody>
</table>
`;

const EMPTY_NATIONS_CHAMPIONSHIP_EDIT_SOURCE_HTML = `
<div class="mw-heading mw-heading2"><h2 id="Fixtures">Fixtures<span class="mw-editsection">[edit source]</span></h2></div>
<div class="mw-heading mw-heading4"><h4 id="Round_3">Round 3<span class="mw-editsection">[edit source]</span></h4></div>
`;

const NATIONS_CHAMPIONSHIP_WORLD_RUGBY_PAYLOAD = {
  event: {
    label: "Nations Championship 2026",
  },
  matches: [
    {
      matchId: "wr-nz-france",
      teams: [{ name: "New Zealand" }, { name: "France" }],
      time: { millis: Date.parse("2026-07-04T07:10:00.000Z") },
      venue: {
        city: "Christchurch",
        country: "New Zealand",
        name: "One New Zealand Stadium",
      },
    },
    {
      matchId: "wr-japan-italy",
      teams: [{ name: "Japan" }, { name: "Italy" }],
      time: { millis: Date.parse("2026-07-04T08:40:00.000Z") },
      venue: {
        city: "Tokyo",
        country: "Japan",
        name: "Prince Chichibu Memorial Stadium",
      },
    },
    {
      matchId: "wr-australia-ireland",
      teams: [{ name: "Australia" }, { name: "Ireland" }],
      time: { millis: Date.parse("2026-07-04T10:10:00.000Z") },
      venue: {
        city: "Sydney | Gadigal",
        country: "Australia",
        name: "Sydney Football Stadium",
      },
    },
    {
      matchId: "wr-fiji-wales",
      teams: [{ name: "Fiji" }, { name: "Wales" }],
      time: { millis: Date.parse("2026-07-04T13:10:00.000Z") },
      venue: {
        city: "Cardiff",
        country: "Wales",
        name: "Cardiff City Stadium",
      },
    },
    {
      matchId: "wr-south-africa-england",
      teams: [{ name: "South Africa" }, { name: "England" }],
      time: { millis: Date.parse("2026-07-04T15:40:00.000Z") },
      venue: {
        city: "Johannesburg",
        country: "South Africa",
        name: "Emirates Airline Park",
      },
    },
    {
      matchId: "wr-argentina-scotland",
      teams: [{ name: "Argentina" }, { name: "Scotland" }],
      time: { millis: Date.parse("2026-07-04T19:10:00.000Z") },
      venue: {
        city: "Cordoba",
        country: "Argentina",
        name: "Estadio Mario Alberto Kempes",
      },
    },
    {
      matchId: "wr-japan-ireland",
      teams: [{ name: "Japan" }, { name: "Ireland" }],
      time: { millis: Date.parse("2026-07-11T10:10:00.000Z") },
      venue: {
        city: "Newcastle | Awabakal-Worimi",
        country: "Australia",
        name: "Newcastle Stadium",
      },
    },
  ],
};

const EMPTY_NATIONS_CHAMPIONSHIP_HTML = `
<section data-mw-section-id="1">
  <div class="mw-heading">Fixtures</div>
  <div class="mw-heading">Southern Hemisphere Series</div>
</section>
`;

const NATIONS_CHAMPIONSHIP_PLACEHOLDER_WORLD_RUGBY_MATCHES = [
  ["NTH 6th", "STH 6th"],
  ["NTH 3rd", "STH 3rd"],
  ["NTH 5th", "STH 5th"],
  ["NTH 2nd", "STH 2nd"],
  ["NTH 4th", "STH 4th"],
  ["NTH 1st", "STH 1st"],
].map(([homeName, awayName], index) => ({
  matchId: `wr-placeholder-${index + 1}`,
  teams: [{ name: homeName }, { name: awayName }],
  time: { millis: Date.parse("2026-11-27T16:40:00.000Z") + index },
}));

function buildNationsChampionshipWorldRugbyPayloadWithPlaceholders() {
  const knownMatches = NATIONS_CHAMPIONSHIP_WORLD_RUGBY_PAYLOAD.matches.map(
    (match, index) => ({
      ...match,
      matchId: `wr-valid-${index + 1}`,
    }),
  );
  const fillerMatches = Array.from({ length: 29 }, (_, index) => ({
    ...NATIONS_CHAMPIONSHIP_WORLD_RUGBY_PAYLOAD.matches[
      index % (NATIONS_CHAMPIONSHIP_WORLD_RUGBY_PAYLOAD.matches.length - 1)
    ],
    matchId: `wr-valid-${knownMatches.length + index + 1}`,
  }));

  return {
    event: {
      label: "Nations Championship 2026",
    },
    matches: [
      ...knownMatches,
      ...fillerMatches,
      ...NATIONS_CHAMPIONSHIP_PLACEHOLDER_WORLD_RUGBY_MATCHES,
    ],
  };
}

const LEAGUE_ONE_HTML = `
<div class="c-schedule">
  <div class="ttl-wrap">
    <h3 class="ttl">NTT JAPAN RUGBY LEAGUE ONE 2024-25 DIVISION1<br> R1 conference B (D1-M1)</h3>
    <p class="place"><a>Suzuka Sports Garden Rugby Ground (Mie)</a></p>
  </div>
  <div class="con">
    <div class="datetime"><p class="date">21.12 <span>Sat</span></p><p class="time">12:10</p></div>
    <ul class="game">
      <li class="home"><a><p class="name only-pc">MIE Honda HEAT</p></a><p class="score">23</p></li>
      <li class="away"><a><p class="name only-pc">BlackRams Tokyo</p></a><p class="score">21</p></li>
    </ul>
  </div>
  <div class="info"><a href="/en/match/27447" class="btn-match-detail">Match Info (Full-Time)</a></div>
</div>
<div class="c-schedule">
  <div class="ttl-wrap">
    <h3 class="ttl">NTT JAPAN RUGBY LEAGUE ONE 2024-25 DIVISION1<br> R2 conference B (D1-M2)</h3>
    <p class="place"><a>Kumagaya Rugby Stadium</a></p>
  </div>
  <div class="con">
    <div class="datetime"><p class="date">28.12 <span>Sat</span></p><p class="time">14:30</p></div>
    <ul class="game">
      <li class="home"><a><p class="name only-pc">Saitama Wild Knights</p></a><p class="score"></p></li>
      <li class="away"><a><p class="name only-pc">SHIZUOKA BlueRevs</p></a><p class="score"></p></li>
    </ul>
  </div>
  <div class="info"><a class="btn-match-detail">Match Info</a></div>
</div>
`;

const LEAGUE_ONE_PLAYOFF_HTML = `
<div class="c-schedule">
  <div class="ttl-wrap">
    <h3 class="ttl">NTT JAPAN RUGBY LEAGUE ONE 2025-26 PLAY-OFFS<br> SEMI-FINAL (D1-M109)</h3>
    <p class="place"><a>Hanazono Rugby Stadium (Osaka)</a></p>
  </div>
  <div class="con">
    <div class="datetime"><p class="date">17.05 <span>Sun</span></p><p class="time">12:05</p></div>
    <ul class="game">
      <li class="home"><a><p class="name only-pc">SHIZUOKA BlueRevs</p></a><p class="score"></p></li>
      <li class="away"><a><p class="name only-pc">KOBELCO KOBE STEELERS</p></a><p class="score"></p></li>
    </ul>
  </div>
  <div class="info"><a class="btn-match-detail">Match Info</a></div>
</div>
<div class="c-schedule">
  <div class="ttl-wrap">
    <h3 class="ttl">NTT JAPAN RUGBY LEAGUE ONE 2025-26 DIVISION2<br> R1 (D2-M1)</h3>
  </div>
  <div class="info"><a href="/en/match/99999" class="btn-match-detail">Match Info</a></div>
</div>
`;

const LEAGUE_ONE_PLAYOFF_FINALS_HTML = `
<div class="c-schedule">
  <div class="ttl-wrap">
    <h3 class="ttl">NTT JAPAN RUGBY LEAGUE ONE 2025-26 PLAY-OFFS<br> 3rd place match/Final (2026POTM01)</h3>
    <p class="place"><a>National Stadium (Tokyo)</a></p>
  </div>
  <div class="con">
    <div class="datetime"><p class="date">31.05 <span>Sun</span></p><p class="time">12:05</p></div>
    <ul class="game">
      <li class="home"><a><p class="name only-pc">TOKYO SUNGOLIATH</p></a><p class="score"></p></li>
      <li class="away"><a><p class="name only-pc">SAITAMA WILD KNIGHTS</p></a><p class="score"></p></li>
    </ul>
  </div>
  <div class="info"><a href="/en/match/29559" class="btn-match-detail">Match Info</a></div>
</div>
<div class="c-schedule">
  <div class="ttl-wrap">
    <h3 class="ttl">NTT JAPAN RUGBY LEAGUE ONE 2025-26 PLAY-OFFS<br> 3rd place match/Final (2026POF01)</h3>
    <p class="place"><a>National Stadium (Tokyo)</a></p>
  </div>
  <div class="con">
    <div class="datetime"><p class="date">31.05 <span>Sun</span></p><p class="time">15:05</p></div>
    <ul class="game">
      <li class="home"><a><p class="name only-pc">KOBELCO KOBE STEELERS</p></a><p class="score"></p></li>
      <li class="away"><a><p class="name only-pc">Kubota Spears</p></a><p class="score"></p></li>
    </ul>
  </div>
  <div class="info"><a href="/en/match/29560" class="btn-match-detail">Match Info</a></div>
</div>
`;

const SUPER_RUGBY_PACIFIC_HTML = `
<div class="mw-heading mw-heading2"><h2 id="Round_1">Round 1</h2></div>
<div class="vevent summary" id="Crusaders_v_Hurricanes">
  <table><tbody><tr><td>13 February 202619:05 NZDT (UTC+13)</td></tr></tbody></table>
  <table><tbody><tr>
    <td class="vcard"><span class="fn org"><a>Crusaders</a></span></td>
    <td>v</td>
    <td class="vcard"><span class="fn org"><a>Hurricanes</a></span></td>
  </tr></tbody></table>
  <table><tbody><tr><td><span class="location">Apollo Projects Stadium</span></td></tr></tbody></table>
</div>
`;

const URC_HTML = `
<div class="mw-heading mw-heading2"><h2 id="Regular_season">Regular season</h2></div>
<div class="mw-heading mw-heading3"><h3 id="Round_1">Round 1</h3></div>
<table class="wikitable mw-collapsible mw-collapsed">
  <tbody>
    <tr>
      <td>26 September 2025</td>
      <td><a href="/wiki/Leinster_Rugby">Leinster</a></td>
      <td>v</td>
      <td><a href="/wiki/Munster_Rugby">Munster</a></td>
      <td>Aviva Stadium, Dublin</td>
    </tr>
    <tr>
      <td>19:35</td>
      <td></td>
      <td>Report</td>
      <td></td>
    </tr>
  </tbody>
</table>
`;

const TOP_14_HTML = `
<div class="mw-heading mw-heading2"><h2 id="Regular_season">Regular season</h2></div>
<div class="mw-heading mw-heading3"><h3 id="Round_1">Round 1</h3></div>
<div class="vevent summary" id="Toulouse_v_Bayonne">
  <table><tbody><tr><td>6 September 2025<br />21:05</td></tr></tbody></table>
  <table><tbody><tr>
    <td class="vcard"><span class="fn org"><a>Toulouse</a></span></td>
    <td>v</td>
    <td class="vcard"><span class="fn org"><a>Bayonne</a></span></td>
  </tr></tbody></table>
  <table><tbody><tr><td><span class="location">Stade Ernest-Wallon</span></td></tr></tbody></table>
</div>
`;

const PREMIERSHIP_FUTURE_ZERO_HTML = `
<div class="mw-heading mw-heading3"><h3 id="Round_1">Round 1</h3></div>
<div class="vevent summary" id="Bath_v_Saracens">
  <table><tbody><tr><td>1 January 2030<br />15:00</td></tr></tbody></table>
  <table><tbody><tr><td><a>Bath</a></td><td>0–0</td><td><a>Saracens</a></td></tr></tbody></table>
  <table><tbody><tr><td><span class="location">The Recreation Ground</span></td></tr></tbody></table>
</div>
`;

const URC_FUTURE_ZERO_HTML = `
<div class="mw-heading mw-heading3"><h3 id="Round_1">Round 1</h3></div>
<table class="mw-collapsible mw-collapsed"><tbody>
  <tr><td>1 January 2030</td><td><a>Leinster</a></td><td>0–0</td><td><a>Munster</a></td><td>Aviva Stadium</td></tr>
  <tr><td>15:00</td></tr>
</tbody></table>
`;

const TOP_14_FUTURE_ZERO_HTML = `
<div class="mw-heading mw-heading3"><h3 id="Round_1">Round 1</h3></div>
<div class="vevent summary" id="Toulouse_v_Bayonne">
  <table><tbody><tr><td>1 January 2030<br />15:00</td></tr></tbody></table>
  <table><tbody><tr><td><a>Toulouse</a></td><td>0–0</td><td><a>Bayonne</a></td></tr></tbody></table>
  <table><tbody><tr><td><span class="location">Stade Ernest-Wallon</span></td></tr></tbody></table>
</div>
`;

const RUGBY_CHAMPIONSHIP_HTML = `
<div class="mw-heading mw-heading2"><h2 id="Fixtures">Fixtures</h2></div>
<div class="mw-heading mw-heading3"><h3 id="Round_1">Round 1</h3></div>
<div class="vevent summary" id="New_Zealand_v_South_Africa">
  <table><tbody><tr><td>5 September 2026<br />19:05 NZST</td></tr></tbody></table>
  <table><tbody><tr>
    <td class="vcard"><span class="fn org"><a>New Zealand</a></span></td>
    <td>v</td>
    <td class="vcard"><span class="fn org"><a>South Africa</a></span></td>
  </tr></tbody></table>
  <table><tbody><tr><td><span class="location">Eden Park</span></td></tr></tbody></table>
</div>
`;

describe("live competition source adapters", () => {
  beforeEach(() => {
    fetcherMock.fetchWithPolicy.mockReset();
  });

  it("registers Six Nations 2027 with the established family and slug", () => {
    expect(
      LIVE_COMPETITION_SOURCES.find(
        (source) => source.competitionSlug === "six-nations-2027",
      ),
    ).toMatchObject({
      competitionName: "Six Nations 2027",
      family: "six-nations",
      fetch: fetchSixNations2027,
      season: "2027",
      sourceLabel: "wikipedia",
    });
  });

  it("registers Nations Championship 2026 after Rugby Championship", () => {
    const rugbyChampionshipIndex = LIVE_COMPETITION_SOURCES.findIndex(
      (source) => source.competitionSlug === "rugby-championship-2026",
    );
    const nationsChampionshipIndex = LIVE_COMPETITION_SOURCES.findIndex(
      (source) => source.competitionSlug === "nations-championship-2026",
    );

    expect(nationsChampionshipIndex).toBe(rugbyChampionshipIndex + 1);
    expect(LIVE_COMPETITION_SOURCES[nationsChampionshipIndex]).toMatchObject({
      competitionName: "Nations Championship 2026",
      family: "nations-championship",
      fetch: fetchNationsChampionship2026,
      fetchEventMatches: fetchNationsChampionship2026EventMatches,
      season: "2026",
      sourceLabel: "wikipedia",
    });
  });

  it("registers Greatest Rivalry 2026 after Nations Championship", () => {
    const nationsChampionshipIndex = LIVE_COMPETITION_SOURCES.findIndex(
      (source) => source.competitionSlug === "nations-championship-2026",
    );
    const greatestRivalryIndex = LIVE_COMPETITION_SOURCES.findIndex(
      (source) => source.competitionSlug === "greatest-rivalry-2026",
    );

    expect(greatestRivalryIndex).toBe(nationsChampionshipIndex + 1);
    expect(LIVE_COMPETITION_SOURCES[greatestRivalryIndex]).toMatchObject({
      competitionName: "Greatest Rivalry 2026",
      competitionNameJa: "グレイテスト・ライバルリー・ツアー",
      family: "greatest-rivalry",
      fetch: fetchGreatestRivalry2026,
      season: "2026",
      sourceLabel: "wikipedia",
    });
  });

  it("registers Lipovitan Challenge Cup 2026 for live ingestion", () => {
    expect(
      LIVE_COMPETITION_SOURCES.find(
        (source) => source.competitionSlug === "lipovitan-challenge-cup-2026",
      ),
    ).toMatchObject({
      competitionName: "Lipovitan-D Challenge Cup 2026",
      family: "lipovitan-challenge-cup",
      fetch: fetchLipovitanChallengeCup2026,
      fetchEventMatches: fetchLipovitanChallengeCup2026EventMatches,
      season: "2026",
      sourceLabel: "wikipedia",
    });
  });

  it("registers the three European club competitions for 2026-27 only", () => {
    expect(LIVE_COMPETITION_SOURCES).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          competitionName: "Premiership 2026-27",
          competitionSlug: "premiership-2026-27",
          family: "premiership",
          season: "2026-27",
          sourceLabel: "wikipedia",
        }),
        expect.objectContaining({
          competitionName: "URC 2026-27",
          competitionSlug: "urc-2026-27",
          family: "urc",
          season: "2026-27",
          sourceLabel: "wikipedia",
        }),
        expect.objectContaining({
          competitionName: "Top 14 2026-27",
          competitionSlug: "top-14-2026-27",
          family: "top-14",
          season: "2026-27",
          sourceLabel: "wikipedia",
        }),
      ]),
    );
    expect(
      LIVE_COMPETITION_SOURCES.some((source) =>
        [
          "premiership-2025-26",
          "top-14-2025-26",
          "urc-2025-26",
        ].includes(source.competitionSlug),
      ),
    ).toBe(false);
  });

  it("uses the requested European club season and clears future 0-0 scores", async () => {
    fetcherMock.fetchWithPolicy
      .mockResolvedValueOnce(new Response(PREMIERSHIP_FUTURE_ZERO_HTML))
      .mockResolvedValueOnce(new Response(URC_FUTURE_ZERO_HTML))
      .mockResolvedValueOnce(new Response(TOP_14_FUTURE_ZERO_HTML));

    await expect(fetchPremiership("2026-27")).resolves.toEqual([
      expect.objectContaining({
        awayScore: null,
        homeScore: null,
        status: "scheduled",
      }),
    ]);
    await expect(fetchUrc("2026-27")).resolves.toEqual([
      expect.objectContaining({
        awayScore: null,
        homeScore: null,
        status: "scheduled",
      }),
    ]);
    await expect(fetchTop14("2026-27")).resolves.toEqual([
      expect.objectContaining({
        awayScore: null,
        homeScore: null,
        status: "scheduled",
      }),
    ]);

    expect(fetcherMock.fetchWithPolicy).toHaveBeenNthCalledWith(
      1,
      "https://en.wikipedia.org/wiki/2026–27_Premiership_Rugby",
    );
    expect(fetcherMock.fetchWithPolicy).toHaveBeenNthCalledWith(
      2,
      "https://en.wikipedia.org/wiki/2026–27_United_Rugby_Championship",
    );
    expect(fetcherMock.fetchWithPolicy).toHaveBeenNthCalledWith(
      3,
      "https://en.wikipedia.org/wiki/2026–27_Top_14_season",
    );
  });

  it("returns an empty array when a European club season page is missing", async () => {
    fetcherMock.fetchWithPolicy.mockRejectedValue(
      new FetchError({
        attempt: 1,
        status: 404,
        url: "https://en.wikipedia.org/wiki/missing",
      }),
    );

    await expect(fetchPremiership("2027-28")).resolves.toEqual([]);
    await expect(fetchUrc("2027-28")).resolves.toEqual([]);
    await expect(fetchTop14("2027-28")).resolves.toEqual([]);
  });

  it("keeps Six Nations 2027 scheduled and finished matches with per-match HTML", () => {
    const wikipediaUrl =
      "https://en.wikipedia.org/wiki/2027_Six_Nations_Championship";
    const matches = parseSixNations2027LiveHtml(
      SIX_NATIONS_2027_HTML,
      wikipediaUrl,
    );

    expect(matches).toHaveLength(2);
    expect(matches[0]).toMatchObject({
      awayTeamName: "England",
      homeTeamName: "Ireland",
      round: 1,
      status: "scheduled",
      wikipediaUrl,
    });
    expect(matches[1]).toMatchObject({
      awayScore: 13,
      awayTeamName: "Wales",
      homeScore: 27,
      homeTeamName: "France",
      status: "finished",
    });
    expect(matches[0]?.rawHtml).toContain('id="Ireland_v_England"');
    expect(matches[0]?.rawHtml).not.toContain('id="France_v_Wales"');
  });

  it("parses Super Rugby Pacific kickoff text with timezone abbreviation", () => {
    const regularWikipediaUrl =
      "https://en.wikipedia.org/wiki/List_of_2026_Super_Rugby_Pacific_matches";
    const matches = parseSuperRugbyPacificLiveHtml({
      regularHtml: SUPER_RUGBY_PACIFIC_HTML,
      regularWikipediaUrl,
      seasonHtml: "",
    });

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      awayTeamSlug: "hurricanes",
      homeTeamSlug: "crusaders",
      kickoffAt: "2026-02-13T06:05:00.000Z",
      round: 1,
      status: "scheduled",
      wikipediaUrl: regularWikipediaUrl,
    });
  });

  it("keeps Premiership scheduled vevents instead of dropping scoreless matches", () => {
    const wikipediaUrl =
      "https://en.wikipedia.org/wiki/2025–26_Premiership_Rugby";
    const matches = parsePremiershipLiveHtml(PREMIERSHIP_HTML, wikipediaUrl);

    expect(matches).toHaveLength(3);
    expect(matches[0]).toMatchObject({
      awayScore: null,
      awayTeamSlug: "bristol-bears",
      homeScore: null,
      homeTeamSlug: "bath",
      status: "scheduled",
      wikipediaUrl,
    });
    expect(matches[1]).toMatchObject({
      awayScore: 17,
      homeScore: 28,
      status: "finished",
    });
    expect(matches[2]).toMatchObject({
      awayTeamSlug: "saracens",
      homeTeamSlug: "bath",
      round: null,
      roundName: "Final",
      status: "finished",
    });
  });

  it("keeps parseable multiday Premiership fixtures when another kickoff is TBC", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const matches = parsePremiershipLiveHtml(`
      <div class="mw-heading"><h3 id="Round_10">Round 10</h3></div>
      <div class="vevent summary">
        <table><tbody><tr><td>22/23/24 January 2027</td></tr></tbody></table>
        <table><tbody><tr><td><a>Bath</a></td><td>v</td><td><a>Northampton Saints</a></td></tr></tbody></table>
        <table><tbody><tr><td><span class="location">The Recreation Ground</span></td></tr></tbody></table>
      </div>
      <div class="vevent summary">
        <table><tbody><tr><td>TBC</td></tr></tbody></table>
        <table><tbody><tr><td><a>Exeter Chiefs</a></td><td>v</td><td><a>Bristol Bears</a></td></tr></tbody></table>
        <table><tbody><tr><td><span class="location">Sandy Park</span></td></tr></tbody></table>
      </div>
      <div class="vevent summary">
        <table><tbody><tr><td>25 January 2027 15:00</td></tr></tbody></table>
        <table><tbody><tr><td><a>Harlequins</a></td><td>v</td><td><a>Leicester Tigers</a></td></tr></tbody></table>
        <table><tbody><tr><td><span class="location">Twickenham Stoop</span></td></tr></tbody></table>
      </div>
    `);

    expect(matches).toHaveLength(2);
    expect(matches).toMatchObject([
      {
        awayTeamName: "Northampton Saints",
        homeTeamName: "Bath",
        kickoffAt: "2027-01-22T00:00:00.000Z",
      },
      {
        awayTeamName: "Leicester Tigers",
        homeTeamName: "Harlequins",
        kickoffAt: "2027-01-25T15:00:00.000Z",
      },
    ]);
    expect(warn).toHaveBeenCalledWith(
      "Skipping Premiership live match with unparseable kickoff: Exeter Chiefs vs Bristol Bears",
    );

    warn.mockRestore();
  });

  it("returns Nations Cup scheduled matches without filtering to finished only", () => {
    const wikipediaUrl =
      "https://en.wikipedia.org/wiki/2026_World_Rugby_Pacific_Nations_Cup";
    const matches = parsePncLiveHtml(PNC_HTML, wikipediaUrl);

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      awayTeamSlug: "fiji",
      homeTeamSlug: "japan",
      round: 1,
      status: "scheduled",
      wikipediaUrl,
    });
  });

  it("returns Nations Cup matches wrapped in Parsoid section elements", () => {
    const wikipediaUrl =
      "https://en.wikipedia.org/wiki/2026_World_Rugby_Pacific_Nations_Cup";
    const matches = parsePncLiveHtml(PNC_PARSOID_HTML, wikipediaUrl);

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      awayTeamSlug: "fiji",
      homeTeamSlug: "japan",
      round: 1,
      status: "scheduled",
      wikipediaUrl,
    });
  });

  it("parses Nations Cup 2026 condensed semi-finals and preserves known finals dates", () => {
    const wikipediaUrl =
      "https://en.wikipedia.org/wiki/2026_World_Rugby_Pacific_Nations_Cup";
    const matches = parsePncLiveHtml(PNC_CONDENSED_2026_HTML, wikipediaUrl);

    expect(matches).toHaveLength(4);
    expect(matches[0]).toMatchObject({
      awayTeamSlug: "canada",
      homeTeamSlug: "fiji",
      kickoffAt: "2026-09-12T07:00:00.000Z",
      round: 101,
      status: "scheduled",
      venue: "Hanazono Rugby Stadium, Higashiōsaka",
      wikipediaUrl,
    });
    expect(matches[1]).toMatchObject({
      awayTeamSlug: "usa",
      homeTeamSlug: "japan",
      kickoffAt: "2026-09-12T10:05:00.000Z",
      round: 101,
      status: "scheduled",
    });
    expect(matches).toContainEqual(
      expect.objectContaining({
        awayTeamName: "Winner SF2",
        homeTeamName: "Winner SF1",
        kickoffAt: "2026-09-19T10:05:00.000Z",
        round: 102,
      }),
    );
    expect(matches).toContainEqual(
      expect.objectContaining({
        awayTeamName: "Loser SF2",
        homeTeamName: "Loser SF1",
        kickoffAt: "2026-09-19T07:00:00.000Z",
        round: 103,
      }),
    );
  });

  it("parses Nations Championship round tables and skips unresolved finals placeholders", () => {
    const wikipediaUrl =
      "https://en.wikipedia.org/wiki/2026_Nations_Championship";
    const matches = parseNationsChampionshipLiveHtml(
      NATIONS_CHAMPIONSHIP_HTML,
      [],
      wikipediaUrl,
    );

    expect(matches).toHaveLength(3);
    expect(matches[0]).toMatchObject({
      awayScore: null,
      awayTeamSlug: "italy",
      homeScore: null,
      homeTeamSlug: "japan",
      kickoffAt: "2026-07-04T00:00:00.000Z",
      round: 1,
      status: "scheduled",
      venue: "Chichibunomiya Rugby Stadium, Tokyo",
      wikipediaUrl,
    });
    expect(matches[1]).toMatchObject({
      awayScore: 20,
      awayTeamSlug: "france",
      homeScore: 31,
      homeTeamSlug: "new-zealand",
      round: 1,
      status: "finished",
    });
    expect(matches[2]).toMatchObject({
      awayTeamSlug: "ireland",
      homeTeamSlug: "japan",
      round: 2,
    });
    expect(
      matches.some(
        (match) =>
          match.homeTeamName === "Northern 6" ||
          match.awayTeamName === "Southern 6",
      ),
    ).toBe(false);
  });

  it("parses Nations Championship round tables with edit source headings", () => {
    const matches = parseNationsChampionshipLiveHtml(
      NATIONS_CHAMPIONSHIP_EDIT_SOURCE_HTML,
      [],
      "https://en.wikipedia.org/wiki/2026_Nations_Championship",
    );

    expect(matches).toHaveLength(6);
    expect(matches.every((match) => match.round === 3)).toBe(true);
    expect(matches[0]).toMatchObject({
      awayScore: 10,
      awayTeamSlug: "italy",
      homeScore: 57,
      homeTeamSlug: "australia",
      round: 3,
      status: "finished",
    });
    expect(matches).toContainEqual(
      expect.objectContaining({
        awayScore: 31,
        awayTeamSlug: "england",
        homeScore: 24,
        homeTeamSlug: "argentina",
        round: 3,
      }),
    );
  });

  it("overlays Nations Championship kickoff times from World Rugby by team pairing", () => {
    const kickoffTimes = parseWorldRugbyNationsChampionshipSchedulePayload(
      NATIONS_CHAMPIONSHIP_WORLD_RUGBY_PAYLOAD,
    );
    const matches = parseNationsChampionshipLiveHtml(
      NATIONS_CHAMPIONSHIP_HTML,
      kickoffTimes,
      "https://en.wikipedia.org/wiki/2026_Nations_Championship",
    );

    expect(kickoffTimes).toHaveLength(7);
    expect(matches[0]).toMatchObject({
      awayTeamSlug: "italy",
      homeTeamSlug: "japan",
      kickoffAt: "2026-07-04T08:40:00.000Z",
      round: 1,
      venue: "Prince Chichibu Memorial Stadium, Tokyo, Japan",
    });
    expect(matches[1]).toMatchObject({
      awayTeamSlug: "france",
      homeTeamSlug: "new-zealand",
      kickoffAt: "2026-07-04T07:10:00.000Z",
      round: 1,
    });
    expect(matches[2]).toMatchObject({
      awayTeamSlug: "ireland",
      homeTeamSlug: "japan",
      kickoffAt: "2026-07-11T10:10:00.000Z",
      round: 2,
    });
  });

  it("skips unresolved World Rugby Nations Championship placeholders without dropping valid matches", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const kickoffTimes = parseWorldRugbyNationsChampionshipSchedulePayload(
      buildNationsChampionshipWorldRugbyPayloadWithPlaceholders(),
    );

    expect(kickoffTimes).toHaveLength(36);
    expect(kickoffTimes[0]).toMatchObject({
      awayTeamSlug: "france",
      homeTeamSlug: "new-zealand",
      worldRugbyMatchId: "wr-valid-1",
    });
    expect(
      kickoffTimes.some((match) =>
        [match.homeTeamSlug, match.awayTeamSlug].some((slug) =>
          /^(nth|sth)-/.test(slug),
        ),
      ),
    ).toBe(false);
    expect(warn).toHaveBeenCalledTimes(6);

    warn.mockRestore();
  });

  it("returns an empty World Rugby kickoff list for placeholder-only Nations Championship payloads", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const kickoffTimes = parseWorldRugbyNationsChampionshipSchedulePayload({
      event: {
        label: "Nations Championship 2026",
      },
      matches: NATIONS_CHAMPIONSHIP_PLACEHOLDER_WORLD_RUGBY_MATCHES,
    });

    expect(kickoffTimes).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(6);

    warn.mockRestore();
  });

  it("fetches Nations Championship matches when the World Rugby schedule includes placeholders", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    fetcherMock.fetchWithPolicy
      .mockResolvedValueOnce(new Response(NATIONS_CHAMPIONSHIP_HTML))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            buildNationsChampionshipWorldRugbyPayloadWithPlaceholders(),
          ),
        ),
      );

    const matches = await fetchNationsChampionship2026();

    expect(fetcherMock.fetchWithPolicy).toHaveBeenCalledTimes(2);
    expect(matches).toHaveLength(3);
    expect(matches[2]).toMatchObject({
      awayTeamSlug: "ireland",
      homeTeamSlug: "japan",
      kickoffAt: "2026-07-11T10:10:00.000Z",
      round: 2,
    });

    warn.mockRestore();
  });

  it("fetches six Nations Championship matches with edit source headings", async () => {
    fetcherMock.fetchWithPolicy
      .mockResolvedValueOnce(
        new Response(NATIONS_CHAMPIONSHIP_EDIT_SOURCE_HTML),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(NATIONS_CHAMPIONSHIP_WORLD_RUGBY_PAYLOAD)),
      );

    const matches = await fetchNationsChampionship2026();

    expect(matches).toHaveLength(6);
    expect(matches.every((match) => match.round === 3)).toBe(true);
    expect(matches).toContainEqual(
      expect.objectContaining({
        awayScore: 0,
        awayTeamSlug: "wales",
        homeScore: 43,
        homeTeamSlug: "south-africa",
        round: 3,
      }),
    );
  });

  it("logs response and structural diagnostics without logging empty Wikipedia HTML", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    fetcherMock.fetchWithPolicy
      .mockResolvedValueOnce(
        new Response(EMPTY_NATIONS_CHAMPIONSHIP_HTML, {
          headers: {
            age: "42",
            "content-encoding": "gzip",
            "content-length": "84",
            "content-type": "text/html; charset=utf-8",
            etag: '"diagnostic-etag"',
            "last-modified": "Sat, 18 Jul 2026 00:00:00 GMT",
            vary: "Accept-Encoding",
            "x-cache": "HIT",
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(NATIONS_CHAMPIONSHIP_WORLD_RUGBY_PAYLOAD)),
      );

    await expect(fetchNationsChampionship2026()).resolves.toEqual([]);

    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(
      "Nations Championship 2026 Wikipedia diagnostics",
      expect.objectContaining({
        age: "42",
        contentEncoding: "gzip",
        contentLength: "84",
        contentType: "text/html; charset=utf-8",
        headingFollowedByDivWithTableCount: 0,
        headingFollowedByTableCount: 0,
        httpStatus: 200,
        mwHeadingCount: 2,
        mwHeadingTexts: ["Fixtures", "Southern Hemisphere Series"],
        reason: "empty-parse-result",
        roundHeadingCount: 0,
        sectionWithMwSectionIdCount: 1,
        source: "wikipedia",
        xCache: "HIT",
      }),
    );

    const diagnosticPayload = warn.mock.calls[0]?.[1];

    expect(JSON.stringify(diagnosticPayload)).not.toContain(
      EMPTY_NATIONS_CHAMPIONSHIP_HTML,
    );
    expect(diagnosticPayload).toHaveProperty("htmlByteLength");
    expect(diagnosticPayload).toHaveProperty("htmlSha256");

    warn.mockRestore();
  });

  it("counts edit source round headings in empty parse diagnostics", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    fetcherMock.fetchWithPolicy
      .mockResolvedValueOnce(
        new Response(EMPTY_NATIONS_CHAMPIONSHIP_EDIT_SOURCE_HTML),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(NATIONS_CHAMPIONSHIP_WORLD_RUGBY_PAYLOAD)),
      );

    await expect(fetchNationsChampionship2026()).resolves.toEqual([]);

    expect(warn).toHaveBeenCalledWith(
      "Nations Championship 2026 Wikipedia diagnostics",
      expect.objectContaining({
        mwHeadingTexts: ["Fixtures[edit source]", "Round 3[edit source]"],
        roundHeadingCount: 1,
      }),
    );

    warn.mockRestore();
  });

  it("identifies whether a missing page came from Wikipedia or World Rugby", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const wikipediaUrl =
      "https://en.wikipedia.org/wiki/2026_Nations_Championship";
    const worldRugbyUrl = "https://api.example.test/nations-championship";

    fetcherMock.fetchWithPolicy
      .mockRejectedValueOnce(
        new FetchError({ attempt: 1, status: 404, url: wikipediaUrl }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(NATIONS_CHAMPIONSHIP_WORLD_RUGBY_PAYLOAD)),
      );

    await expect(fetchNationsChampionship2026()).resolves.toEqual([]);
    expect(warn).toHaveBeenLastCalledWith(
      "Nations Championship 2026 Wikipedia diagnostics",
      expect.objectContaining({
        htmlByteLength: null,
        htmlSha256: null,
        httpStatus: 404,
        requestUrl: wikipediaUrl,
        source: "wikipedia",
      }),
    );

    fetcherMock.fetchWithPolicy.mockReset();
    warn.mockClear();
    fetcherMock.fetchWithPolicy
      .mockResolvedValueOnce(new Response(NATIONS_CHAMPIONSHIP_HTML))
      .mockRejectedValueOnce(
        new FetchError({ attempt: 1, status: 404, url: worldRugbyUrl }),
      );

    await expect(fetchNationsChampionship2026()).resolves.toEqual([]);
    expect(warn).toHaveBeenLastCalledWith(
      "Nations Championship 2026 source fetch diagnostics",
      expect.objectContaining({
        httpStatus: 404,
        requestUrl: worldRugbyUrl,
        source: "world-rugby",
      }),
    );

    warn.mockRestore();
  });

  it("does not add diagnostic logs when Nations Championship matches are parsed", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    fetcherMock.fetchWithPolicy
      .mockResolvedValueOnce(new Response(NATIONS_CHAMPIONSHIP_HTML))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(NATIONS_CHAMPIONSHIP_WORLD_RUGBY_PAYLOAD)),
      );

    await expect(fetchNationsChampionship2026()).resolves.toHaveLength(3);

    expect(warn).not.toHaveBeenCalledWith(
      "Nations Championship 2026 Wikipedia diagnostics",
      expect.anything(),
    );

    warn.mockRestore();
  });

  it("keeps URC regular season scheduled vevents", () => {
    const wikipediaUrl =
      "https://en.wikipedia.org/wiki/2025–26_United_Rugby_Championship";
    const matches = parseUrcLiveHtml(URC_HTML, wikipediaUrl);

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      awayTeamSlug: "munster",
      homeTeamSlug: "leinster",
      round: 1,
      status: "scheduled",
      wikipediaUrl,
    });
  });

  it("keeps Top 14 regular season scheduled vevents", () => {
    const wikipediaUrl = "https://en.wikipedia.org/wiki/2025–26_Top_14_season";
    const matches = parseTop14LiveHtml(TOP_14_HTML, wikipediaUrl);

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      awayTeamSlug: "bayonne",
      homeTeamSlug: "toulouse",
      round: 1,
      status: "scheduled",
      wikipediaUrl,
    });
  });

  it("keeps League One scheduled cards without Full-Time or scores", () => {
    const sourceUrl = "https://league-one.jp/en/schedule/?t1=3&year=2024";
    const matches = parseLeagueOneLiveHtml(
      LEAGUE_ONE_HTML,
      "2024-25",
      sourceUrl,
    );

    expect(matches).toHaveLength(2);
    expect(matches[0]).toMatchObject({
      awayScore: 21,
      awayTeamSlug: "ricoh-black-rams",
      homeScore: 23,
      homeTeamSlug: "honda-heat",
      status: "finished",
      wikipediaUrl: sourceUrl,
    });
    expect(matches[1]).toMatchObject({
      awayScore: null,
      awayTeamSlug: "shizuoka-blue-revs",
      eventId: "2_saitama_wild_knights_v_shizuoka_bluerevs",
      homeScore: null,
      homeTeamSlug: "saitama-wild-knights",
      status: "scheduled",
    });
  });

  it("keeps League One playoff cards and stores the stage name", () => {
    const sourceUrl = "https://league-one.jp/en/schedule/?t1=0&year=2025";
    const matches = parseLeagueOneLiveHtml(
      LEAGUE_ONE_PLAYOFF_HTML,
      "2025-26",
      sourceUrl,
    );

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      awayScore: null,
      awayTeamSlug: "kobelco-kobe-steelers",
      eventId: "playoff_shizuoka_bluerevs_v_kobelco_kobe_steelers",
      homeScore: null,
      homeTeamSlug: "shizuoka-blue-revs",
      kickoffAt: "2026-05-17T03:05:00.000Z",
      round: null,
      roundName: "SEMI-FINAL",
      status: "scheduled",
      wikipediaUrl: sourceUrl,
    });
  });

  it("separates League One third-place and final playoff labels", () => {
    const matches = parseLeagueOneLiveHtml(
      LEAGUE_ONE_PLAYOFF_FINALS_HTML,
      "2025-26",
    );

    expect(matches).toHaveLength(2);
    expect(matches[0]).toMatchObject({
      awayTeamSlug: "saitama-wild-knights",
      eventId: "match_29559",
      homeTeamSlug: "tokyo-suntory-sungoliath",
      round: null,
      roundName: "3rd place match",
    });
    expect(matches[1]).toMatchObject({
      awayTeamSlug: "kubota-spears",
      eventId: "match_29560",
      homeTeamSlug: "kobelco-kobe-steelers",
      round: null,
      roundName: "Final",
    });
    expect(matches[0]?.roundName).not.toBe(matches[1]?.roundName);
    expect(matches[0]?.roundName?.toLowerCase()).not.toContain("final");
  });

  it("annotates remaining live Wikipedia sources with the parsed source URL", () => {
    const autumnUrl =
      "https://en.wikipedia.org/wiki/2026_Autumn_Nations_Series";
    const rugbyChampionshipUrl =
      "https://en.wikipedia.org/wiki/2026_Rugby_Championship";

    expect(
      parseAutumnNationsLiveHtml(SIX_NATIONS_2027_HTML, autumnUrl)[0],
    ).toMatchObject({ wikipediaUrl: autumnUrl });
    expect(
      parseRugbyChampionshipLiveHtml(
        RUGBY_CHAMPIONSHIP_HTML,
        rugbyChampionshipUrl,
      )[0],
    ).toMatchObject({ wikipediaUrl: rugbyChampionshipUrl });
    expect(
      parseGreatestRivalryLiveHtml(
        RUGBY_CHAMPIONSHIP_HTML,
        rugbyChampionshipUrl,
      )[0],
    ).toMatchObject({ wikipediaUrl: rugbyChampionshipUrl });
    expect(
      parseNationsChampionshipEventHtml(
        SIX_NATIONS_2027_HTML,
        NATIONS_CHAMPIONSHIP_SOUTHERN_HEMISPHERE_URL,
      )[0],
    ).toMatchObject({
      wikipediaUrl: NATIONS_CHAMPIONSHIP_SOUTHERN_HEMISPHERE_URL,
    });
  });

  it("returns an empty array when the Greatest Rivalry page is missing", async () => {
    const sourceUrl =
      "https://en.wikipedia.org/wiki/2026_New_Zealand_rugby_union_tour_of_South_Africa";
    fetcherMock.fetchWithPolicy.mockRejectedValueOnce(
      new FetchError({ attempt: 1, status: 404, url: sourceUrl }),
    );

    await expect(fetchGreatestRivalry2026()).resolves.toEqual([]);
    expect(fetcherMock.fetchWithPolicy).toHaveBeenCalledWith(sourceUrl);
  });
});

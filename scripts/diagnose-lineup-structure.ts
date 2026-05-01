import * as cheerio from "cheerio";

import { parseWikipediaSixNationsHtml } from "@/lib/ingestion/sources/wikipedia-six-nations";
import { fetchWithPolicy } from "@/lib/scrapers";
import { parseLineupFromTableHtml } from "@/lib/scrapers/wikipedia-lineups";

async function main() {
  const pageUrl = "https://en.wikipedia.org/wiki/2025_Six_Nations_Championship";
  const response = await fetchWithPolicy(pageUrl);
  const html = await response.text();
  const $ = cheerio.load(html);
  const matches = parseWikipediaSixNationsHtml(html);

  // vevent 内の wikitable 数を確認
  const firstMatch = matches[0]!;
  const $v = cheerio.load(firstMatch.rawHtml);
  console.log(
    `vevent 内 wikitable 数 (${firstMatch.homeTeamName} v ${firstMatch.awayTeamName}): ${$v("table.wikitable").length}`,
  );
  console.log(
    `lineupTableHtml: ${firstMatch.lineupTableHtml ? "found" : "missing"}`,
  );

  if (firstMatch.lineupTableHtml) {
    const lineup = parseLineupFromTableHtml(
      firstMatch.lineupTableHtml,
      pageUrl,
    );
    console.log(
      `parsed lineup: home=${lineup?.home_players.length ?? 0} away=${lineup?.away_players.length ?? 0}`,
    );
  }

  // vevent 直後の兄弟要素を確認
  const fixturesSection = $("#Fixtures").closest("div");
  let cursor = fixturesSection.next();
  let veventSeen = 0;

  while (cursor.length > 0 && veventSeen < 1) {
    if (cursor.is("div.vevent.summary")) {
      veventSeen++;
      let sibling = cursor.next();
      let tableCount = 0;
      for (let i = 0; i < 6 && sibling.length > 0; i++) {
        const tag =
          (sibling.prop("tagName") as string | undefined)?.toLowerCase() ?? "?";
        const cls = sibling.attr("class") ?? "";
        console.log(`  [${i}] <${tag} class="${cls}">`);
        if (tag === "table" && tableCount < 1) {
          sibling
            .find("tr")
            .slice(0, 6)
            .each((_, row) => {
              const cells = $(row).find("td");
              console.log(`       row(${cells.length} cells):`);
              cells.each((ci, cell) => {
                const text = $(cell)
                  .text()
                  .replace(/\s+/g, " ")
                  .trim()
                  .slice(0, 60);
                console.log(`         td[${ci}]: ${text}`);
              });
            });
          tableCount++;
        }
        sibling = sibling.next();
      }
    }
    cursor = cursor.next();
  }
}

main().catch(console.error);

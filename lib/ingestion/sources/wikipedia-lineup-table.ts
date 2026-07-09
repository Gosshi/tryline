import type * as cheerio from "cheerio";

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function findAdjacentLineupTableHtml(
  $: cheerio.CheerioAPI,
  block: ReturnType<cheerio.CheerioAPI>,
) {
  let sibling = block.next();

  while (sibling.length > 0) {
    if (
      sibling.is("div.vevent.summary") ||
      sibling.is("table.mw-collapsible") ||
      (sibling.is("div.mw-heading") && sibling.find("h2, h3").length > 0)
    ) {
      break;
    }

    if (
      sibling.is("table") &&
      normalizeWhitespace(sibling.attr("class") ?? "") === ""
    ) {
      return $.html(sibling);
    }

    sibling = sibling.next();
  }

  return null;
}

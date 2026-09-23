import { stripWikitextMarkup } from "@/lib/ingestion/sources/wikipedia-wikitext";

export type ParsedJapanTestHistory = {
  playedOn: string;
  opponentName: string;
  teamScore: number;
  opponentScore: number;
  venue: string | null;
  competitionLabel: string | null;
};

type Cell = { header: boolean; value: string };

function splitCells(value: string, separator: "!" | "|") {
  const parts: string[] = [];
  let current = "";
  let links = 0;
  let templates = 0;
  for (let i = 0; i < value.length; i += 1) {
    const pair = value.slice(i, i + 2);
    if (pair === "[[") {
      links += 1;
      current += pair;
      i += 1;
      continue;
    }
    if (pair === "]]" && links > 0) {
      links -= 1;
      current += pair;
      i += 1;
      continue;
    }
    if (pair === "{{") {
      templates += 1;
      current += pair;
      i += 1;
      continue;
    }
    if (pair === "}}" && templates > 0) {
      templates -= 1;
      current += pair;
      i += 1;
      continue;
    }
    if (value[i] === separator && links === 0 && templates === 0) {
      parts.push(current.trim());
      current = "";
      if (value[i + 1] === separator) i += 1;
      continue;
    }
    current += value[i];
  }
  parts.push(current.trim());
  return parts;
}

function cleanCell(value: string) {
  return stripWikitextMarkup(
    value.replace(/^[^|]*\|(?=\s*\[\[)/, "").replace(/<[^>]+>/g, " "),
  );
}

function normalizeHeader(value: string) {
  return stripWikitextMarkup(value.replace(/^[^|]*\|/, ""))
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

function parseOpponent(value: string): { name: string } | null {
  const link = value.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
  if (!link) return null;
  const target = link[1]!.trim().replaceAll("_", " ");
  const display = stripWikitextMarkup(link[2] ?? target);
  const name = target.replace(/\s+(?:national )?rugby union team$/i, "").trim();
  if (!name || display !== name) return null;
  return { name };
}

export function parseJapanTestHistory(
  wikitext: string,
  today = new Date().toISOString().slice(0, 10),
): ParsedJapanTestHistory[] {
  const result: ParsedJapanTestHistory[] = [];
  const tables = wikitext.match(/\{\|[\s\S]*?\|\}/g) ?? [];
  for (const table of tables) {
    const lines = table.split(/\r?\n/);
    let headers: string[] = [];
    let row: Cell[] = [];
    const rows: Cell[][] = [];
    const flush = () => {
      if (row.length) rows.push(row);
      row = [];
    };
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("!")) {
        headers.push(...splitCells(trimmed.replace(/^!+/, ""), "!"));
      } else if (/^\|-/.test(trimmed)) {
        flush();
      } else if (trimmed.startsWith("|") && !trimmed.startsWith("|}")) {
        row.push(
          ...splitCells(trimmed.replace(/^\|+/, ""), "|").map((value) => ({
            header: false,
            value,
          })),
        );
      }
    }
    flush();
    if (!headers.length) continue;
    const normalized = headers.map(normalizeHeader);
    const dateIndex = normalized.indexOf("date");
    const opponentIndex = normalized.indexOf("opponent");
    const forIndex = normalized.indexOf("f");
    const againstIndex = normalized.indexOf("a");
    const venueIndex = normalized.indexOf("venue");
    const cityIndex = normalized.indexOf("city");
    const tournamentIndex = normalized.indexOf("tournament");
    if ([dateIndex, opponentIndex, forIndex, againstIndex].some((n) => n < 0))
      continue;
    for (const cells of rows) {
      if (cells.some((cell) => cell.header)) continue;
      const values = cells.map((cell) => cell.value);
      const date = cleanCell(values[dateIndex!] ?? "");
      const teamScoreText = cleanCell(values[forIndex!] ?? "");
      const opponentScoreText = cleanCell(values[againstIndex!] ?? "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) continue;
      if (!/^\d+$/.test(teamScoreText) || !/^\d+$/.test(opponentScoreText))
        continue;
      const opponent = parseOpponent(values[opponentIndex!] ?? "");
      if (!opponent) continue;
      const venueParts = [
        venueIndex >= 0 ? values[venueIndex] : "",
        cityIndex >= 0 ? values[cityIndex] : "",
      ]
        .map((value) => cleanCell(value ?? ""))
        .filter(Boolean);
      result.push({
        playedOn: date,
        opponentName: opponent.name,
        teamScore: Number(teamScoreText),
        opponentScore: Number(opponentScoreText),
        venue: venueParts.length ? [...new Set(venueParts)].join(", ") : null,
        competitionLabel:
          tournamentIndex >= 0
            ? cleanCell(values[tournamentIndex] ?? "") || null
            : null,
      });
    }
  }
  return result;
}

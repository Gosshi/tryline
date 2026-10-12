import { parseResearchPaste } from "@/lib/discord/research-paste";
import { isUuid } from "@/lib/ids";

import type { ParsedResearchPaste } from "@/lib/discord/research-paste";

export type BulkPasteBlock = {
  heading: string;
  headingLine: number;
  matchId: string | null;
  paste: ParsedResearchPaste;
};
export function splitBulkResearchPaste(text: string): {
  blocks: BulkPasteBlock[];
  linesBeforeFirstHeading: number;
} {
  const raw: Array<{
    heading: string;
    headingLine: number;
    matchId: string | null;
    body: string[];
  }> = [];
  let linesBeforeFirstHeading = 0;
  for (const [index, line] of text.split(/\r?\n/u).entries()) {
    if (line.startsWith("## ")) {
      const heading = line.slice(3);
      const candidate = heading.match(/\/matches\/(.{36})/u)?.[1];
      const matchId =
        candidate && isUuid(candidate) ? candidate.toLowerCase() : null;
      raw.push({ heading, headingLine: index + 1, matchId, body: [] });
    } else if (raw.length) raw[raw.length - 1]!.body.push(line);
    else if (line.trim()) linesBeforeFirstHeading++;
  }
  const merged: typeof raw = [];
  for (const block of raw) {
    const prior = block.matchId
      ? merged.find((item) => item.matchId === block.matchId)
      : null;
    if (prior) prior.body.push("", ...block.body);
    else merged.push(block);
  }
  return {
    blocks: merged.map(({ body, ...block }) => ({
      ...block,
      paste: parseResearchPaste(body.join("\n")),
    })),
    linesBeforeFirstHeading,
  };
}

import { fetchWithPolicy } from "@/lib/scrapers/fetcher";

export type WikitextTemplate = {
  params: Record<string, string>;
  raw: string;
  startIndex: number;
};

function buildWikipediaRawUrl(pageTitle: string) {
  const encodedTitle = encodeURIComponent(pageTitle.replaceAll(" ", "_"));

  return `https://en.wikipedia.org/wiki/${encodedTitle}?action=raw`;
}

function findTemplateEnd(wikitext: string, startIndex: number) {
  let depth = 0;

  for (let index = startIndex; index < wikitext.length; index += 1) {
    const pair = wikitext.slice(index, index + 2);

    if (pair === "{{") {
      depth += 1;
      index += 1;
      continue;
    }

    if (pair === "}}") {
      depth -= 1;
      index += 1;

      if (depth === 0) {
        return index + 1;
      }
    }
  }

  throw new Error("Unterminated wikitext template.");
}

function splitTopLevel(value: string, delimiter: string) {
  const parts: string[] = [];
  let current = "";
  let linkDepth = 0;
  let templateDepth = 0;

  for (let index = 0; index < value.length; index += 1) {
    const pair = value.slice(index, index + 2);

    if (pair === "{{") {
      templateDepth += 1;
      current += pair;
      index += 1;
      continue;
    }

    if (pair === "}}" && templateDepth > 0) {
      templateDepth -= 1;
      current += pair;
      index += 1;
      continue;
    }

    if (pair === "[[") {
      linkDepth += 1;
      current += pair;
      index += 1;
      continue;
    }

    if (pair === "]]" && linkDepth > 0) {
      linkDepth -= 1;
      current += pair;
      index += 1;
      continue;
    }

    const character = value[index]!;

    if (character === delimiter && templateDepth === 0 && linkDepth === 0) {
      parts.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  parts.push(current);
  return parts;
}

function parseTemplateParams(template: string) {
  const body = template.slice(2, -2);
  const [, ...entries] = splitTopLevel(body, "|");
  const params: Record<string, string> = {};

  for (const entry of entries) {
    const [key, ...valueParts] = splitTopLevel(entry, "=");

    if (valueParts.length === 0) {
      continue;
    }

    params[key!.trim().toLowerCase()] = valueParts.join("=").trim();
  }

  return params;
}

function stripTemplateMarkup(value: string) {
  return value.replace(/\{\{([^{}]*)\}\}/g, (_, body: string) => {
    const [name, ...args] = splitTopLevel(body, "|");

    if (name?.trim().toLowerCase() === "flagicon") {
      return "";
    }

    const firstArgument = args.find((argument) => !argument.includes("="));
    return firstArgument?.trim() ?? "";
  });
}

export async function fetchWikipediaWikitext(pageTitles: string[]) {
  if (pageTitles.length === 0) {
    throw new Error("At least one Wikipedia page title is required.");
  }

  const wikitexts: string[] = [];

  for (const pageTitle of pageTitles) {
    const response = await fetchWithPolicy(buildWikipediaRawUrl(pageTitle));
    wikitexts.push(await response.text());
  }

  return wikitexts.join("\n");
}

export function parseWikitextTemplates(
  wikitext: string,
  templateName: string,
): WikitextTemplate[] {
  const escapedName = templateName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const templateStart = new RegExp(`\\{\\{\\s*${escapedName}\\b`, "gi");
  const templates: WikitextTemplate[] = [];
  let matched: RegExpExecArray | null;

  while ((matched = templateStart.exec(wikitext))) {
    const endIndex = findTemplateEnd(wikitext, matched.index);
    const raw = wikitext.slice(matched.index, endIndex);

    templates.push({
      params: parseTemplateParams(raw),
      raw,
      startIndex: matched.index,
    });
    templateStart.lastIndex = endIndex;
  }

  return templates;
}

export function stripWikitextMarkup(value: string) {
  let cleaned = value
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<ref\b[^>]*>[\s\S]*?<\/ref\s*>/gi, "")
    .replace(/<ref\b[^>]*\/\s*>/gi, "")
    .replace(/<br\s*\/?>/gi, " ");

  while (/\{\{[^{}]*\}\}/.test(cleaned)) {
    cleaned = stripTemplateMarkup(cleaned);
  }

  return cleaned
    .replace(/\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g, (_, target, label) =>
      typeof label === "string" ? label : target,
    )
    .replace(/'{2,}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeWikitextTeam(value: string) {
  return stripWikitextMarkup(value)
    .replace(/\(\s*\d+\s+BP\s*\)/gi, "")
    .replace(/^\(\s*\d+\s*\)|\(\s*\d+\s*\)$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

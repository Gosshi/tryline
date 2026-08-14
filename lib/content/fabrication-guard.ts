import type { SourcedFactInput } from "@/lib/llm/types";

export const UNSUPPORTED_STATISTIC_ISSUE = "データに存在しない統計値を含む";
export const UNGROUNDED_PLAYER_REFERENCE_ISSUE =
  "ラインアップ不在にもかかわらず選手個別言及を含む";
export const UNGROUNDED_ENTITY_ISSUE = "入力データに存在しない人名を含む";
export const WINNER_MISMATCH_ISSUE = "スコアと矛盾する勝敗記述を含む";
export const PLAYER_STAT_MISMATCH_ISSUE =
  "選手別得点統計がmatch_eventsと矛盾しています";
export const CONTRADICTED_ZERO_STAT_CLAIM_ISSUE =
  "ゼロという断定が実際のteam_statsの数値と矛盾";

type ZeroClaimStatField =
  | "errors"
  | "penalties_conceded"
  | "red_cards"
  | "tackles_missed"
  | "turnovers"
  | "yellow_cards";

type ZeroClaimTeamStats = {
  away?: Partial<Record<ZeroClaimStatField, number>> | null;
  home?: Partial<Record<ZeroClaimStatField, number>> | null;
};

const UNSUPPORTED_STATISTIC_PATTERN =
  /\d+\s*%|成功率|テリトリー|支配率|ポゼッション|ランメートル|ラインブレイク|獲得率|スティール率|22m進入|\d+回中\d+回|反則/;
const KEY_PLAYER_CONTEXT_PATTERN =
  /キープレイヤー|注目選手|注目のマッチアップ|マッチアップ|スタメン|先発|出場メンバー/;
const RUGBY_POSITION_PATTERN =
  /プロップ|フッカー|ロック|フランカー|ナンバー8|スクラムハーフ|フライハーフ|センター|ウイング|フルバック|PR|HO|LO|FL|No\.?\s*8|SH|SO|CTB|WTB|FB/;
const PLAYER_WITH_POSITION_PATTERN =
  /[一-龥々ァ-ヶーA-Za-z][一-龥々ァ-ヶーA-Za-z・\s]{1,30}[（(]\s*(?:プロップ|フッカー|ロック|フランカー|ナンバー8|スクラムハーフ|フライハーフ|センター|ウイング|フルバック|PR|HO|LO|FL|No\.?\s*8|SH|SO|CTB|WTB|FB)\s*[）)]/;
const LINEUP_FACT_PATTERN =
  /先発|リザーブ|スタメン|出場メンバー|starting XV|replacements/i;
const PERSON_LIKE_NAME_PATTERN =
  /[一-龥々ぁ-んァ-ヶー]{2,}|[A-Z][a-z]+(?:[ -][A-Z][a-z]+)+/;

const ZERO_CLAIM_STAT_FIELDS: Record<string, ZeroClaimStatField> = {
  エラー: "errors",
  イエローカード: "yellow_cards",
  タックルミス: "tackles_missed",
  ターンオーバー: "turnovers",
  ペナルティ: "penalties_conceded",
  レッドカード: "red_cards",
  反則: "penalties_conceded",
};

function buildZeroClaimPattern(label: string): RegExp {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${escaped}(?:なし|ゼロ|を犯さ(?:ず|ない)|0(?:回)?)`);
}

function extractStatisticSignals(text: string): string[] {
  const signals = new Set<string>();
  for (const match of text.matchAll(/\d+\s*%/g)) {
    signals.add(match[0].replace(/\s+/g, ""));
  }

  for (const keyword of [
    "成功率",
    "テリトリー",
    "支配率",
    "ポゼッション",
    "ランメートル",
    "ラインブレイク",
    "獲得率",
    "スティール率",
    "22m進入",
    "反則",
  ]) {
    if (text.includes(keyword)) {
      signals.add(keyword);
    }
  }

  return [...signals];
}

const STATISTIC_SIGNAL_ALIASES: Record<string, string[]> = {
  "22m進入": ["22m entry", "22-metre entry", "22-meter entry"],
  スティール率: ["steal rate"],
  テリトリー: ["territory"],
  ポゼッション: ["possession"],
  ラインブレイク: ["line break"],
  ランメートル: ["run metres", "run meters", "metres made", "meters made"],
  反則: ["ペナルティ", "penalty", "penalties conceded"],
  成功率: ["success rate", "accuracy"],
  支配率: ["possession", "territory share"],
  獲得率: ["win rate", "success rate"],
};

function factSupportsSignal(fact: string, signal: string): boolean {
  const normalizedFact = fact.toLowerCase().replace(/\s+/g, "");
  if (normalizedFact.includes(signal.toLowerCase().replace(/\s+/g, ""))) {
    return true;
  }

  return (STATISTIC_SIGNAL_ALIASES[signal] ?? []).some((alias) =>
    normalizedFact.includes(alias.toLowerCase().replace(/\s+/g, "")),
  );
}

export function containsUnsupportedStatistic(
  text: string,
  supportedFacts: string[] = [],
): boolean {
  if (!UNSUPPORTED_STATISTIC_PATTERN.test(text)) {
    return false;
  }

  const signals = extractStatisticSignals(text);
  if (signals.length === 0) {
    return true;
  }

  return signals.some(
    (signal) =>
      !supportedFacts.some((fact) => factSupportsSignal(fact, signal)),
  );
}

export function containsContradictedZeroStatClaim(
  text: string,
  teamStats: ZeroClaimTeamStats | null | undefined,
): boolean {
  if (!teamStats) {
    return false;
  }

  return Object.entries(ZERO_CLAIM_STAT_FIELDS).some(([label, field]) => {
    if (!buildZeroClaimPattern(label).test(text)) {
      return false;
    }

    const homeValue = teamStats.home?.[field];
    const awayValue = teamStats.away?.[field];

    return (
      (typeof homeValue === "number" && homeValue > 0) ||
      (typeof awayValue === "number" && awayValue > 0)
    );
  });
}

function hasNumberedPlayerList(fact: string) {
  return (fact.match(/\d+(?=\s*\S)/g) ?? []).length >= 3;
}

function hasCommaSeparatedPlayerList(fact: string) {
  return (
    fact
      .split(/[、,，]/)
      .filter((entry) => PERSON_LIKE_NAME_PATTERN.test(entry)).length >= 3
  );
}

export function hasConfirmedSourcedFactLineup(
  sourcedFacts: readonly SourcedFactInput[],
): boolean {
  return sourcedFacts.some((sourcedFact) => {
    const fact = sourcedFact?.fact;

    return (
      sourcedFact?.confidence === "high" &&
      typeof fact === "string" &&
      LINEUP_FACT_PATTERN.test(fact) &&
      (hasNumberedPlayerList(fact) || hasCommaSeparatedPlayerList(fact))
    );
  });
}

export function containsUngroundedPlayerReference(
  text: string,
  options: {
    hasConfirmedSourcedFactLineup: boolean;
    hasEvents: boolean;
    hasLineups: boolean;
  },
): boolean {
  if (
    options.hasLineups ||
    options.hasEvents ||
    options.hasConfirmedSourcedFactLineup
  ) {
    return false;
  }

  const normalized = text.replace(/\s+/g, " ").trim();

  if (!KEY_PLAYER_CONTEXT_PATTERN.test(normalized)) {
    return false;
  }

  return (
    PLAYER_WITH_POSITION_PATTERN.test(normalized) ||
    RUGBY_POSITION_PATTERN.test(normalized)
  );
}

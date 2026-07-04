export const UNSUPPORTED_STATISTIC_ISSUE =
  "データに存在しない統計値を含む";
export const UNGROUNDED_PLAYER_REFERENCE_ISSUE =
  "ラインアップ不在にもかかわらず選手個別言及を含む";
export const UNGROUNDED_ENTITY_ISSUE =
  "入力データに存在しない人名を含む";

const UNSUPPORTED_STATISTIC_PATTERN =
  /\d+\s*%|成功率|テリトリー|支配率|ポゼッション|ランメートル|ラインブレイク|獲得率|スティール率|22m進入/;
const KEY_PLAYER_CONTEXT_PATTERN =
  /キープレイヤー|注目選手|注目のマッチアップ|マッチアップ|スタメン|先発|出場メンバー/;
const RUGBY_POSITION_PATTERN =
  /プロップ|フッカー|ロック|フランカー|ナンバー8|スクラムハーフ|フライハーフ|センター|ウイング|フルバック|PR|HO|LO|FL|No\.?\s*8|SH|SO|CTB|WTB|FB/;
const PLAYER_WITH_POSITION_PATTERN =
  /[一-龥々ァ-ヶーA-Za-z][一-龥々ァ-ヶーA-Za-z・\s]{1,30}[（(]\s*(?:プロップ|フッカー|ロック|フランカー|ナンバー8|スクラムハーフ|フライハーフ|センター|ウイング|フルバック|PR|HO|LO|FL|No\.?\s*8|SH|SO|CTB|WTB|FB)\s*[）)]/;

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

export function containsUngroundedPlayerReference(
  text: string,
  hasLineups: boolean,
  hasEvents: boolean,
): boolean {
  if (hasLineups || hasEvents) {
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

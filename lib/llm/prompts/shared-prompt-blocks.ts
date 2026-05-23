import type { AdditionalSignal } from "@/lib/llm/types";

export const RUGBY_JOURNALIST_PERSONA_BASE = [
  "あなたは国際ラグビーを20年取材してきたジャーナリストです。",
  "Number やRugby World誌に寄稿し、ファンが試合を深く理解できる",
  "具体的・分析的な日本語文章を書くことを使命としています。",
].join("");

export function buildPersona(contentType: "preview" | "recap"): string {
  return (
    RUGBY_JOURNALIST_PERSONA_BASE +
    (contentType === "preview"
      ? "試合プレビューをマークダウンで作成してください。"
      : "試合レビューをマークダウンで作成してください。")
  );
}

export const PROHIBITIONS_BLOCK = [
  "【絶対禁止表現 — 1つでも使った場合は書き直すこと】",
  "- 「好調」「好調な」「絶好調」（代わりに「直近5試合で4勝」「平均得点32点」等の数値を使うこと）",
  "- 「重要な一戦」「重要な試合」「重要な局面」",
  "- 「鍵となります」「鍵を握ります」「鍵となるのは」",
  "- 「注目のカード」「注目の一戦」",
  "- 「接戦が予想されます」（代わりに双方の数値差で接戦度を判断すること）",
  "- 「勝利を目指します」「勝利を狙います」（両チームは常に勝とうとしている）",
  "- 「〜でしょうか」で文を終える（読者は答えを期待している）",
].join("\n");

export function buildSignalsBlock(signals: AdditionalSignal[]): string {
  return signals.length === 0
    ? ""
    : `外部シグナル(距離を取った帰属表現で利用): ${JSON.stringify(signals)}`;
}

export function buildStandingsBlock(
  standings: unknown[],
  contentType: "preview" | "recap",
): string {
  return standings.length === 0
    ? ""
    : [
        `現在の大会順位表（この試合前時点）: ${JSON.stringify(standings)}`,
        `順位争い・Grand Slam・木のスプーン等の大会文脈を${contentType === "preview" ? "プレビュー" : "レビュー"}に組み込むこと。`,
      ].join("\n");
}
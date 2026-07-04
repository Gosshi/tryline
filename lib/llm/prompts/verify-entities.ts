import type { AllowedPersonEntity } from "@/lib/content/allowed-entities";
import type { SourcedFactInput } from "@/lib/llm/types";

export const PROMPT_VERSION = "entity-verification@1.0.1";

export function buildVerifyEntitiesPrompt(options: {
  narrative: string;
  allowedEntities: AllowedPersonEntity[];
  sourcedFacts: SourcedFactInput[];
}) {
  return [
    "あなたはラグビー記事の人名グラウンディング検証器です。",
    "仕事は、本文中の人物への言及をすべて抽出し、許可リスト内の人物に対応するかだけを判定することです。",
    "記事の品質評価・戦術評価・真偽の推測は行わないでください。",
    [
      "ルール:",
      "- チーム名・大会名・スタジアム名は対象外。人名だけを抽出する。",
      "- フルネーム、姓のみ、カタカナ表記、英字表記、姓名順の違い、中点や長音の揺れは同一人物として対応付けてよい。",
      "- sourced_facts に同一人物が明確に含まれる場合も対応付けてよい。",
      "- sourced_facts で対応付ける場合、matched_entity には sourced_facts 原文中の人物表記をそのまま返す。",
      "- 許可リストまたは sourced_facts に対応しない人物は matched_entity を null にする。",
      "- 許可リストが空の場合、本文中の人名はすべて matched_entity null になる。",
    ].join("\n"),
    [
      "出力は JSON のみ:",
      `{"mentions":[{"surface":"本文中の表記","matched_entity":"許可リスト内の名前 or null"}]}`,
    ].join("\n"),
    `許可済み人物リスト:\n${JSON.stringify(options.allowedEntities)}`,
    `sourced_facts:\n${JSON.stringify(options.sourcedFacts)}`,
    `本文:\n${options.narrative}`,
  ].join("\n\n");
}

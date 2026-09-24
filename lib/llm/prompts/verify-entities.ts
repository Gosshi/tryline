import type { AllowedPersonEntity } from "@/lib/content/allowed-entities";
import type { SourcedFactInput } from "@/lib/llm/types";

export const PROMPT_VERSION = "entity-verification@1.2.0";


export function buildRetryVerifyEntitiesPrompt(options: {
  surfaces: string[];
  allowedEntities: AllowedPersonEntity[];
  sourcedFacts: SourcedFactInput[];
}) {
  return [
    "あなたはラグビー記事の人名表記の再照合器です。",
    "各表記が、許可済み人物の誰かを日本語で書いたものかを判定してください。",
    "カタカナ表記では、中点・ハイフン・スペースの有無、長音、ヴ／ブ、ティ／チなどの表記の揺れは同じ人物として扱ってください。判定できないものは null にしてください。姓だけの表記は広げず、人物を特定できない場合は null にしてください。",
    "sourced_facts に同一人物が明確に含まれる場合も対応付けてよいです。sourced_facts で対応付ける場合、matched_entity には原文中の人物表記をそのまま返してください。許可済み人物または sourced_facts に対応しない表記は null にしてください。",
    `再照合する表記:\n${JSON.stringify(options.surfaces)}`,
    `許可済み人物リスト:\n${JSON.stringify(options.allowedEntities)}`,
    `sourced_facts:\n${JSON.stringify(options.sourcedFacts)}`,
    '出力は JSON のみ: {"mentions":[{"surface":"対象表記","matched_entity":"許可済み人物名 or null"}]}',
  ].join("\n\n");
}

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
      "- 許可リストが空でも、sourced_facts に対応する人物まで null にしてはいけない。null にするのは許可リストにも sourced_facts にも対応しない人物のみ。",
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

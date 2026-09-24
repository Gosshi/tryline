import { buildMatchPhaseFacts, buildVariantBDataBlocks } from "./shared";

import type {
  AdditionalSignal,
  AssembledContentInput,
  TacticalPoint,
} from "@/lib/llm/types";

export const PROMPT_VERSION = "preview-b@0.2.0";

export function buildGeneratePreviewBPrompt(
  assembled: AssembledContentInput,
  tacticalPoints: TacticalPoint[],
  additionalSignals: AdditionalSignal[],
): string {
  const phase = buildMatchPhaseFacts(assembled);
  return [
    ...buildVariantBDataBlocks({
      assembled,
      tacticalPoints,
      additionalSignals,
      contentType: "preview",
    }),
    phase,
    `試合前のプレビューを書いてください。読者は海外ラグビーを日本語で追うファンで、この記事は試合ページに載ります。同じページに先発一覧の表があるため、背番号と名前を本文で並べ直しません。

中心に置く問いは一つです。問いは、今回の入力にある具体的な対比から選びます。sourced_factsがあるだけで核心を決めず、試合固有の出来事として重いかどうかで選びます。

予想スコア、勝率、勝者、映像未確認の攻防を作らないでください。過去の得失点差だけから攻撃力・守備力の優劣を断定しません。得点・失点の実績を分けて比べ、相手・対象期間が異なることを無視しません。

構成は次の4節です。2～4節の見出しは、今回の具体的な内容に合わせて付けます。見出しに「セクション1」等の連番を書きません。

# この試合の核心
200字以内の通常段落で、見るべき問いと、その問いが生まれる具体的な対比を示します。今回の結果はまだ分からないという視点を守ります。

# ［この対戦で問われることを示す見出し］
大会の位置づけと、問いを立てる理由を、確認できる事実から説明します。順位・勝ち上がり条件は、対象時点と大会形式を確認できる場合だけ使います。核心を言い換えて伸ばさず、読者が判断するための背景を一段加えます。

# ［両チームの記録の違いを示す見出し］
問いに答えるために必要な比較を選び、数値の対象と期間を明確にします。数字を並べた後、その比較から言えることを説明します。平均得点は今回の予想得点ではありません。両軍の確定メンバーと個別の根拠がある場合だけ実名の対比を行い、片側だけ確認できるときは、相手側の人物や役割を補いません。

# ［観戦中に確かめたいことを示す見出し］
核心の問いに対応する観察点を2～3個に絞り、それぞれ「試合のどの時点で、何を見れば、問いへの答えに近づくか」を示します。予言ではなく観戦の手がかりとして書きます。新しい統計や戦術設定を持ち込まず、前節の数字を繰り返しません。

全体は1,500～1,800字を目安とします。各節の最低字数は設けません。根拠のある背景・比較・観察点で満たし、同じ説明や同じ断り書きの反復、一般的なラグビー解説で埋めません。出力は日本語のマークダウン本文だけです。`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

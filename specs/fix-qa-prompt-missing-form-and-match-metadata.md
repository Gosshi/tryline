# QA 判定プロンプトに直近フォーム・大会名・会場が渡っておらず正しい記述が却下される問題

## 背景

2026-08-08、グレイテスト・ライバルリー・ツアー開幕戦（ストーマーズ vs ニュージーランド、match_id: `c5888e6d-caf9-48b8-963e-ed2355e36edd`）の recap が QA に reject された。

```
QAスコア: 情報密度 5/5 / 日本語品質 4/5 / 事実根拠 2/5
問題点: 入力データにない直近5試合の戦績・平均得点、大会名、会場情報を断定しています。
```

**指摘された項目はいずれも捏造ではなく、DB 実測と完全に一致する。**

| 記事の記載 | DB 実測 | 判定 |
|---|---|---|
| NZ 直近5試合 4勝 | 4勝1敗（40-21 IRE / 47-17 ITA / 34-32 FRA / 52-26 WAL / 19-33 ENG） | 正しい |
| NZ 平均得点 38.4点 | (40+47+34+52+19) ÷ 5 = 38.4 | 正しい |
| ストーマーズ 2勝2敗1分 | L・W・L・D・W | 正しい |
| グレイテスト・ライバルリー2026 | `competitions.name` に実在 | 正しい |
| ケープタウン・スタジアム | `matches.venue` に実在 | 正しい |

材料を集め直して再生成しても（`cron-post-match-recap-refresh.yml` を 8/8 で実行、conclusion=success）、`factual_grounding: 2` と同一の指摘で再び reject された。**この記事は現状の実装では何度再生成しても publish に到達しない。**

### 根本原因

`lib/llm/prompts/qa-content.ts` の `QaMatchContext`（17-29行）に **大会名と会場が存在しない**。さらに `formStats` は型に定義されているにもかかわらず、**プロンプト文字列を組み立てる 151-188 行のどのブロックにも出力されていない**。

組み立てられるブロックは以下がすべてで、`formStats` 用のブロックが存在しない。

- `winnerCheckBlock` / `turningPointCheckBlock` / `playerStatCheckBlock`
- `sourcedFactsBlock` / `recapSourcedFactsDensityBlock`
- `derivedStatsBlock` / `teamStatsBlock`

一方 `sourcedFactsBlock` は sourced_facts が0件のとき、判定者にこう指示する（106-109行）。

> sourced_facts はゼロです。本文がWeb由来の統計・負傷・欠場・選手コメント・発言（入力データにない内容）を含む場合は factual_grounding を 2 以下に下げること。

**生成側は大会名・会場・直近フォームを持っているが、判定側からは見えない。** そのため正当な記述が「入力データにない」と判定される。

なお `formStats` は `lib/llm/stages/qa.ts` の 433 行で `containsUnsupportedStatistic` のプログラム側ガードには渡されている。**プログラム側には渡り、LLM 判定者には渡らない**という非対称が生じている。

### 平均得点は formStats に存在しない

`TeamFormStats` 型は `win_rate_last_5` のみを持つ（13-15行）。`buildFormStatsFactsForSide`（`qa.ts` 198-200行付近）も勝率しか文字列化しない。**平均得点は型にもガードにも判定プロンプトにも一切存在しない。**

これは `fix-qa-win-rate-false-positive.md`（マージ済み）が対象外として明示的に先送りしたスコープにあたる。

> `avg_points_for_last_5` / `avg_points_against_last_5` 等、percentage 以外の `key_stats` フィールドの扱い（`\d+\s*%` にマッチしないため今回は対象外。将来的に別の誤検知が見つかれば別 spec）

本 spec がその「別 spec」である。

### 既存の類似 spec との違い

| spec | 直した経路 |
|---|---|
| `fix-qa-win-rate-false-positive.md` | プログラム側ガードに勝率を配線（`factual_grounding: 1`） |
| `fix-qa-team-stats-new-fields-unsupported.md` | プログラム側ガードに team_stats 新フィールドを配線（`factual_grounding: 1`） |
| **本 spec** | **LLM 判定者のプロンプトに欠落しているコンテキストを補う（`factual_grounding: 2`）** |

前2件は決定的ガードの配線漏れ、本件は LLM 判定プロンプトの情報欠落であり、経路が異なる。

### 影響範囲

recap 用 sourced_facts が0件のコンテンツは 967 本存在し、うち 845 本は published（`factual_grounding` 平均 4.90）である。したがって「facts 0件なら必ず却下」ではない。却下されるのは**本文が大会名・会場・直近フォームに言及した場合**に限られる。

裏を返すと、**記事がこれらに触れた瞬間に落ちる**。直近フォームへの言及は生成プロンプト側が推奨している記述であり、良い記事ほど落ちやすい構造になっている。

## スコープ

対象:
- `QaMatchContext` に大会名・会場を追加する
- `TeamFormStats` に平均得点（for / against）と直近5試合の勝敗内訳を追加する
- 上記を LLM 判定プロンプトのブロックとして出力する
- 呼び出し側（`lib/llm/pipeline.ts` の matchContext 構築箇所）で値を配線する

対象外:
- プログラム側ガード（`containsUnsupportedStatistic`）の判定ロジック変更。`fix-qa-win-rate-false-positive.md` / `fix-qa-team-stats-new-fields-unsupported.md` の結果を維持する
- 採点ルーブリックの閾値変更
- sourced_facts 0件時の指示文（106-109行）の削除。**この指示自体は正しい**。不足していたのは「入力データ」の側であって、指示ではない
- 生成プロンプト（`generate-recap.ts` / `generate-preview.ts`）の変更
- 字数目標と水増しの関係（別 spec。下記「未解決の質問」参照）
- 該当 recap の再生成そのもの（本 spec マージ後に `content-regen` の手順で実施）

## データモデル変更

**なし。マイグレーション不要。** 既存の `matches.venue`・`competitions.name` と、`assemble` ステージが既に算出している直近成績を QA へ渡すだけ。

## API サーフェス

### 1. `QaMatchContext` の拡張（`lib/llm/prompts/qa-content.ts`）

```ts
export type TeamFormStats = {
  win_rate_last_5: number | null;
  avg_points_for_last_5: number | null;
  avg_points_against_last_5: number | null;
  record_last_5: string | null; // 例 "4勝1敗" / "2勝2敗1分"
};

export type QaMatchContext = {
  // 既存フィールド...
  competitionName?: string | null;
  venue?: string | null;
};
```

`assemble` ステージが既に持っているフィールド名と揃えること。新しい名前を発明せず、実装時に既存の型を確認してから決める。

### 2. 判定プロンプトへのブロック追加

`derivedStatsBlock` / `teamStatsBlock` と**同じ形式**で追加する。既存2ブロックの文面を踏襲すること。

- `matchMetaBlock`: 大会名・会場。「本文がこれらに言及している場合、入力データに基づく正当な記述として扱い factual_grounding を下げないこと」
- `formStatsBlock`: 直近5試合の勝敗内訳・平均得点。同上

値が `null` / `undefined` のときはブロックを出力しない（既存2ブロックと同じ挙動）。

### 3. 配線

`lib/llm/pipeline.ts` の QA 呼び出しで `matchContext` を組み立てている箇所に、大会名・会場・拡張した form stats を渡す。

**値の出どころは生成側と同一にすること。** 生成プロンプトが参照している `assembled` の値をそのまま QA にも渡す。QA 用に別途 DB を引き直すと、今回と同じ「生成側と判定側が別の入力を見る」構造が再発する。

## UI サーフェス

なし。

## LLM 連携

QA ステージの判定プロンプトのみ。新規 LLM 呼び出しは追加しない。モデル・段数・採点スキーマは変更しない。

## 受け入れ条件

1. `QaMatchContext` に `competitionName` と `venue` が存在する。
2. `TeamFormStats` に平均得点（for / against）と直近5試合の勝敗内訳が存在する。
3. `buildQaContentPrompt` の出力に、大会名・会場を含むブロックが現れる。値が無い場合はブロックが現れない。
4. `buildQaContentPrompt` の出力に、直近5試合の勝敗内訳と平均得点を含むブロックが現れる。値が無い場合はブロックが現れない。**現状これらが一切出力されていないことを、修正前の挙動を固定するテストで明示すること。**
5. `lib/llm/pipeline.ts` の QA 呼び出しで上記が配線されている。値の出どころが生成側と同一であることをテストで担保する。
6. プログラム側ガード（`containsUnsupportedStatistic`）の既存挙動が変わっていない。`fix-qa-win-rate-false-positive.md` と `fix-qa-team-stats-new-fields-unsupported.md` のテストが引き続き通る。
7. sourced_facts 0件時の既存指示文（106-109行）が維持されている。
8. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` がすべて clean。

## 未解決の質問

1. **字数目標が水増しを誘発している疑いがある。** 初回生成（3399字）では 67〜76分の19点連取が「核心」「全体像」「ターニングポイント」「次戦への示唆」に6回以上登場し、同じ得点経過を3〜4回語り直していた。QA も「水増し感があります」と指摘している。GPT-4o は材料不足だと短く出して字数で弾かれていたが、**GPT-5.6 は字数を繰り返しで満たす**。短すぎる記事は弾けるが、水増しされた記事は字数ゲートを通過する。より検出しにくい失敗様式であり、別 spec の候補。

2. **本 spec は 2026-08-08 の日本代表戦 recap にも影響する。** 同戦のプレビューも直近5試合の平均得点に言及しており、recap も同様の記述になる可能性が高い。マージが間に合わない場合、当該 recap は同じ理由で reject されうる。

3. **`fetch-sourced-facts` が recap 用に0件しか返さない件は未解決。** `force=true` で実行し HTTP 200 が返ったにもかかわらず、`match_sourced_facts` の recap 行は0件のままだった。Wikipedia には当該試合の詳細な試合レポートが存在する（preview では Wikipedia 由来の先発メンバー2件を取得できている）。収集経路の調査は本 spec の対象外だが、材料不足の根本要因として別途追う価値がある。

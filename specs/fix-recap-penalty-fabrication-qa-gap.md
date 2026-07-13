# recap の「反則なし・クリーンなプレー」捏造をQAゲートが検出できない不具合修正

## 背景

2026-07-13、`fix-recap-hardcoded-playoff-framing.md`（PR #550・マージ済み）適用後、日本 vs アイルランド戦（match_id: `d9f72ea3-17da-4eac-b20d-c6bfe0f185b4`）のrecapを4回再生成した結果:

- 1回目・2回目・3回目: いずれも同一パターンの捏造（「日本は反則が多く」「アイルランドは反則を犯さないプレーが功を奏した」等）を含み、`UNSUPPORTED_STATISTIC_ISSUE`（`データに存在しない統計値を含む`）でQAがreject（`verdict: reject`, `factual_grounding: 1`）
- 4回目: **同じ「反則なし」「クリーンなプレー」という捏造を3箇所含んだまま**、QAが`issues: []` `verdict: publish`で見逃し、実際に本番へpublishされてしまった

さらに調査したところ、**この捏造は今回の再生成で新規発生したものではなく、修正前の元のpublished recap（`recap@4.13.0`、今回の再生成で上書き消失）にも同一の文言「アイルランドの規律あるプレーと反則の少なさも、試合の流れを有利に進める要因でした」が既に存在していた**。つまり `fix-recap-hardcoded-playoff-framing.md` とは無関係な、独立した既存バグ。

### 根本原因（特定済み）

`lib/content/fabrication-guard.ts` の決定的検出パターン（LLM判定に依存しない、信頼できるバックストップ）が「反則」関連の捏造を一切カバーしていない:

```ts
// L9-10
const UNSUPPORTED_STATISTIC_PATTERN =
  /\d+\s*%|成功率|テリトリー|支配率|ポゼッション|ランメートル|ラインブレイク|獲得率|スティール率|22m進入|\d+回中\d+回/;
```

このパターンに `反則` は含まれていない。`extractStatisticSignals()`（L18-41）のキーワードループ、`STATISTIC_SIGNAL_ALIASES`（L43-53）にも同様に存在しない。

一方、`MatchTeamStats` 型・`buildFactsForSide()`（`lib/llm/stages/qa.ts` L139-141）には既に `penalties_conceded` フィールドと「◯◯チームのペナルティ${count}」というfact文字列生成ロジックが存在する。**インフラは既にあるが、fabrication-guard側の検出パターンに反則関連キーワードが欠けている**ため、`containsUnsupportedStatistic()` がこの種の捏造を素通りさせる。

LLM側のQA判定（`buildQaContentPrompt`、`lib/llm/prompts/qa-content.ts`）はプロンプトで「本文がこの一覧に無いWeb由来の統計...を述べている場合はfactual_groundingを下げること」と指示しているが、これはLLMの主観判定であり非決定的（temperature: 0でも、4回中1回見逃した実績あり）。決定的ガード（`applyDeterministicQaGuards`、`lib/llm/stages/qa.ts` L337-479）が唯一の信頼できる砦だが、この砦に穴がある。

同様に `lib/llm/prompts/shared-prompt-blocks.ts` の `PROHIBITIONS_BLOCK`（L27）は「入力データに無い統計（成功率・テリトリー%・支配率・ランメートル・ラインブレイク数・22m進入回数）を数値で書くことは禁止」と定めているが、「反則なし」「クリーンなプレー」「規律あるプレー」は数値を伴わない**定性的な捏造**であり、この禁止句の対象として明示されていないため、生成段階での予防が効いていない。

## スコープ

対象:
- `lib/content/fabrication-guard.ts`: `UNSUPPORTED_STATISTIC_PATTERN`・`extractStatisticSignals()`・`STATISTIC_SIGNAL_ALIASES` に「反則」関連の検出を追加
- `lib/llm/prompts/shared-prompt-blocks.ts`: `PROHIBITIONS_BLOCK` に、反則の有無・多寡を定性的に断定する表現の禁止句を追加（生成段階での予防）
- 日本 vs アイルランド戦（`d9f72ea3-17da-4eac-b20d-c6bfe0f185b4`）を含む、NC 7月シリーズ第2節6試合recapの、本修正後の再生成

対象外:
- `match_team_stats` テーブルへの実データ投入（現状全DB 0件。本specはデータが無い場合に捏造させない・検出することが目的で、データ投入は別issue）
- QAプロンプト（`qa-content.ts`）側のLLM判定ロジック変更（決定的ガードで担保するため、LLM判定の改善は不要と判断。将来的に他の定性的捏造パターンが見つかった場合は同じ要領で決定的ガード側に追加していく方針を維持）
- `fix-recap-kick-attempt-ratio-fabrication.md` で対応済みの「◯回中◯回」パターンの再修正（既存のまま）

## データモデル変更

なし。

## API サーフェス

なし。

## 実装詳細

### 1. `lib/content/fabrication-guard.ts`

`UNSUPPORTED_STATISTIC_PATTERN`（L9-10）に「反則」を追加:

```ts
const UNSUPPORTED_STATISTIC_PATTERN =
  /\d+\s*%|成功率|テリトリー|支配率|ポゼッション|ランメートル|ラインブレイク|獲得率|スティール率|22m進入|\d+回中\d+回|反則/;
```

`extractStatisticSignals()`（L18-41）のキーワードループに `"反則"` を追加。

`STATISTIC_SIGNAL_ALIASES`（L43-53）に追加:

```ts
反則: ["ペナルティ", "penalty", "penalties conceded"],
```

理由: `buildFactsForSide()`（`lib/llm/stages/qa.ts` L139-141）が生成するfact文字列は「◯◯チームのペナルティ${count}」という表記（"反則"ではなく"ペナルティ"）のため、エイリアスなしでは `factSupportsSignal()` がマッチしない。将来 `match_team_stats.penalties_conceded` に実データが入った場合に正しく「グラウンディング済み」と判定されるようにする。

**"ペナルティ" 自体はパターンに追加しない**: recap本文には「ペナルティゴール」（match_eventsに実在する得点イベント種別）という正当な表現が頻出するため、"ペナルティ" をトリガーキーワードにすると誤検知（false positive）を起こす。"反則" のみをトリガーとする。

### 2. `lib/llm/prompts/shared-prompt-blocks.ts`

`PROHIBITIONS_BLOCK`（L27付近）に追加:

```
"- そのチームの反則数データ（team_stats等）が入力に存在しない限り、「反則なし」「反則を犯さない」「クリーンなプレー」「規律あるプレー」等、反則の有無・多寡を定性的に断定する表現は禁止。反則に触れる場合は入力データに実在する反則数のみを使用すること。",
```

## LLM 連携

パイプライン Stage 3（ナラティブ生成）のプロンプト変更、および Stage 4（QA）の決定的パターンマッチング拡張。いずれもコスト増なし、追加のLLM呼び出しなし。

再生成コスト見積もり（対象6試合、うち1試合は既に4回分の再生成コストが発生済み）:
- 残り再生成対象は最大6件（日本vsアイルランドを含む全件を本修正後にやり直す）。単価は既存の`lib/llm/pricing.ts`・`content-regen`スキルの見積もり手順に従う（1件あたり$0.02〜0.05、6件で$0.14〜0.31程度）。
- **試し焼き必須**: 日本vsアイルランド戦（過去に捏造が繰り返し発生した実績あり）を含む2件程度で先に検証し、`content_md`に「反則」を含む場合は`sourced_facts`/`team_stats`による裏付けがあることを確認してから残りを実行する。

## 受け入れ条件

1. `tests/content/fabrication-guard.test.ts` に新規テストケースを追加:
   - `containsUnsupportedStatistic("アイルランドは反則なしのクリーンなプレーで勝利した")` が `true` を返す
   - `containsUnsupportedStatistic("アイルランドは反則を犯さないプレーで試合を支配した")` が `true` を返す
   - `containsUnsupportedStatistic("アイルランドは反則が少なかった", ["ホームチームのペナルティ5"])` は `false` を返す（グラウンディングされた反則データがある場合は許可）
   - 既存の「ペナルティゴールを決めた」等、得点プレーとしての「ペナルティ」表現が誤って `true` にならないこと（回帰テスト）
2. 既存の `UNSUPPORTED_STATISTIC_PATTERN` のテストケース（成功率・テリトリー%・回中パターン等）の挙動に変更がないこと
3. `PROHIBITIONS_BLOCK` に反則の定性的断定表現を禁止する一文が追加されていること
4. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通ること
5. 本spec自体は再生成を伴わない。日本vsアイルランド戦を含む6試合recapの再生成は、本specマージ後に別途 `content-regen` 手順（試し焼き→検品→残り全件）で実施する

## 未解決の質問

- 「規律」「クリーン」等、"反則"という単語を直接使わない類似の定性的捏造（例:「アイルランドは反則ゼロで試合を進めた」に対し「反則ゼロ」ではなく単に「終始冷静だった」のような婉曲表現）が今後別途出現する可能性がある。`fix-recap-kick-attempt-ratio-fabrication.md` の「未解決の質問」と同様、次に発見された場合は同じ要領でパターンを追加する方針とする
- `match_team_stats` テーブルが全DB 0件である現状（実データが一切無い）を踏まえ、当面すべての「反則」言及は自動的に「未裏付け」として扱われる。これは意図した挙動（データが無い以上、反則について何も書かないのが正しい）

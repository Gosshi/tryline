# recap のキック試投回数（成功率）表現の捏造を防ぐ

## 背景

2026-07-08、`南アフリカ vs イングランド`戦（match_id: `b5b2af27-4b42-4d58-8ea9-f13d1e2b1466`）のイベント汚染修正（`fix-nc2026-sa-vs-england-event-gap.md`）後、recap を2回連続で再生成したところ、**2回とも同一の未検証統計**でQAゲートに reject された:

> 「彼（コルベ）はコンバージョンを7回中5回成功させ」

`match_events` には**成功したコンバージョン（5回）のみ**が記録されており、**失敗した試投は一切記録されていない**（イベントテーブルの設計上、成功イベントのみを記録する仕様）。したがって「7回中」という分母は、モデルが根拠なく生成した数値であり、`feat-recap-player-stat-verification.md`（PR #509、実装済み）の `PLAYER_STAT_MISMATCH_ISSUE` によって正しく検出・reject された。

ゲートによる事後検出（reject）は正しく機能しているが、**生成のたびに同じ表現が再現し、無駄な再生成コスト・reject が繰り返される**。既存の `PROHIBITIONS_BLOCK`（`shared-prompt-blocks.ts:27`）は「成功率・テリトリー%・支配率」等を禁止しているが、「◯回中◯回成功」という**比率の別表現**は禁止リストに含まれておらず、`UNSUPPORTED_STATISTIC_PATTERN`（`fabrication-guard.ts:9`）の正規表現にも「回中」パターンは含まれていない。これは `fix-recap-opening-variety.md` → `fix-recap-opening-variety-v2.md` で見た「禁止フレーズリストの一つを埋めても別表現に逃げる」パターンと同種の再発である。

## スコープ

対象:
- `lib/llm/prompts/shared-prompt-blocks.ts` の `PROHIBITIONS_BLOCK` に、キック等の「試投回数（分母）」に言及する表現の禁止句を追加する
- `lib/content/fabrication-guard.ts` の `UNSUPPORTED_STATISTIC_PATTERN` に、「◯回中◯回」形式のパターンを追加し、決定的チェックでも検出できるようにする（防御の多層化）

対象外:
- `feat-recap-player-stat-verification.md`（PR #509）のロジック変更（正しく機能している。本 spec は生成段階での予防を追加するもの）
- match_events に「試投失敗」イベントを新設するデータモデル変更（スクレイピングソースに失敗試投のデータが無いため対象外）
- 南アフリカ vs イングランド戦の recap の再生成そのもの（本 spec 適用後、別途 `content-regen` の手順で試す）

## データモデル変更

なし。

## API サーフェス

なし。

## 実装詳細

### 1. `PROHIBITIONS_BLOCK`（`shared-prompt-blocks.ts:27` 付近）に追加

既存の統計禁止句（27行目）の直後に追加:

```
"- キック・コンバージョン・ペナルティゴールの「◯回中◯回成功」「成功率」という試投回数（分母）を含む表現は禁止。match_events には成功した得点イベントのみが記録され、失敗した試投は記録されていないため、分母を伴う成功率は必ず根拠のない数値になる。代わりに成功した本数のみを述べること（例:「コンバージョンを5本決めた」）。",
```

### 2. `UNSUPPORTED_STATISTIC_PATTERN`（`fabrication-guard.ts:9`）に追加

既存の正規表現に「回中」パターンを追加し、決定的検出でも捕捉できるようにする:

```ts
const UNSUPPORTED_STATISTIC_PATTERN =
  /\d+\s*%|成功率|テリトリー|支配率|ポゼッション|ランメートル|ラインブレイク|獲得率|スティール率|22m進入|\d+回中\d+回/;
```

`\d+回中\d+回` は「7回中5回」のような表現にマッチする。既存の `containsUnsupportedStatistic` 呼び出し箇所（`lib/llm/stages/qa.ts:446`）はそのまま使え、変更不要。

## LLM 連携

パイプライン Stage 3（ナラティブ生成）のプロンプト変更、および Stage 4（QA）の決定的パターンマッチング拡張。いずれもコスト増なし。

## 受け入れ条件

1. `PROHIBITIONS_BLOCK` に「◯回中◯回成功」形式の禁止句が追加されている
2. `UNSUPPORTED_STATISTIC_PATTERN` が「7回中5回」のような文字列にマッチする（ユニットテストで確認）
3. 既存の `UNSUPPORTED_STATISTIC_PATTERN` のテストケース（成功率・テリトリー%等）の挙動に変更がない
4. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る
5. 本 spec は再生成を伴わない。南アフリカ vs イングランド戦の recap 再生成は本 spec マージ後に別途 `content-regen` 手順で試す

## 未解決の質問

- 「◯回中◯回」以外にも同種の分母言及表現（例:「7本のキックのうち5本」）が別途出現する可能性がある。今回は最も直接的な言い回しのみ禁止するが、次に発見された場合は本 spec と同じ要領で追加する

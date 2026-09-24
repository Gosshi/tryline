# 記事生成モデルを GPT-6 系に切り替えるかの比較（試し焼き）

## 背景

Owner の意向（2026-09-24）: GPT-5.6 Terra より低コストで性能が高いなら GPT-6 系を使いたい。Luna も GPT-5.6 Luna から GPT-6 Luna への切り替えを検討したい。

### 現在のモデル（`lib/llm/models.ts`）

| 定数 | モデル | 使う段階 |
|---|---|---|
| `NARRATIVE` | `gpt-5.6-terra` | 本文生成（`lib/llm/stages/generate-narrative.ts`） |
| `FAST` | `gpt-5.6-luna` | 事実抽出（`extract-facts.ts`）・QA（`qa.ts`）・固有名詞照合（`verify-entities.ts`） |
| `WEB_SEARCH` | `gpt-5.6-terra` | 出典付き事実の収集（`lib/llm/sourced-facts/fetch.ts`） |
| `CHAT` | `gpt-4o-mini` | AI チャット |

### GPT-6 系（2026-09-24 に OpenAI 公式で確認）

- `gpt-6-sol`・`gpt-6-luna` は **2026-09-22 公開**（[changelog](https://developers.openai.com/api/docs/changelog)）。`gpt-6-astra` は 9/3 公開の最上位
- **GPT-6 に Terra は無い**（Astra・Sol・Luna の 3 段）
- どちらも Responses API・構造化出力・Web 検索に対応（[gpt-6-sol](https://developers.openai.com/api/docs/models/gpt-6-sol)、[gpt-6-luna](https://developers.openai.com/api/docs/models/gpt-6-luna)）。`reasoning.effort` は `none`〜`max`、既定 `medium`
- GPT-5.6 の廃止予定は changelog に無い

料金（USD / 100 万トークン、短い文脈、[pricing](https://developers.openai.com/api/docs/pricing)）:

| モデル | 入力 | 出力 | 比較 |
|---|---:|---:|---|
| gpt-5.6-terra（現・本文） | 2.00 | 12.00 | |
| **gpt-6-sol** | 2.00 | **10.00** | 本文の置き換え候補。出力 −17% |
| gpt-5.6-luna（現・抽出/QA） | 0.20 | 1.20 | |
| **gpt-6-luna** | **0.10** | **0.50** | 抽出/QA の置き換え候補。約半額 |
| gpt-6-astra | 10.00 | 50.00 | 本文には高すぎる（Terra の約 5 倍） |

**公式の性能比較（GPT-6 Sol と GPT-5.6 Terra の文章品質・事実性・日本語）は、読める範囲で見つからなかった。** 発表記事は 403 で読めない。**性能はこのプロジェクトの記事で試して比べるしかない。**

### 今の費用と時間（`pipeline_runs`、2026-08-25〜09-24）

- 記事 93 本で **$12.93**（1 本 約 $0.14）
- 段階別の平均（成功・失敗・再試行を含む）:

| 段階 | 内容 | モデル | 1 回の費用 | 1 回の時間 | 回数（recap / preview） |
|---|---|---|---:|---:|---|
| 2 | 事実抽出 | Luna | $0.002 | 10〜13 秒 | 106 / 65 |
| 3 | 本文生成 | **Terra** | **$0.04〜0.055** | **30〜40 秒** | 133 / 106 |
| 4 | QA | Luna | $0.003〜0.006 | 11〜19 秒 | 130 / 106 |

- **費用の約 9 割が本文生成**。QA で作り直しになる分を含め、1 本あたり平均 1.25 回走る
- 抽出と QA を GPT-6 Luna にしても、節約は月 $0.7 程度。**Luna の切り替えの主な論点は費用ではなく、QA の判定が変わるかどうか**

### 見込み（仮説）

- 本文を GPT-6 Sol にすると、出力単価が 17% 下がる。ただし GPT-6 は推論トークン（出力として課金）の使い方が違う可能性があり、**1 本あたりの費用が本当に下がるかは測るまで分からない**
- 速度が上がれば、記事生成の時間切れ（`specs/fix-orchestrate-throughput.md`）にも効く。これも測るまで分からない

### 落とし穴: 単価表に無いモデルは例外になる

`lib/llm/pricing.ts` の `normalizeModelForPricing` は、表に無いモデル名で `Unsupported model for pricing` を投げる。**`MODELS` を GPT-6 に書き換えるだけだと、LLM を呼んで課金された後に費用計算で落ち、記事の生成がすべて失敗する。** 表には GPT-6 系が無い。あわせて `gpt-5.6-sol` の単価（表では 5 / 30）が現行（4 / 20、8/21 改定）と違う。

## スコープ

対象:
1. `lib/llm/pricing.ts` に GPT-6 系の単価を足し、`gpt-5.6-sol` を現行に直す
2. 本文生成・抽出・QA・固有名詞照合のモデルを**呼び出し側から差し替えられる**ようにする（既定値は今の `MODELS` のまま。本番の挙動は変えない）
3. 比較用のスクリプト（公開しない試し焼き）

対象外:
- `MODELS` の既定値の変更（比較の結果を見て別 PR。下の「切り替えの判断」）
- `WEB_SEARCH`・`CHAT` のモデル
- プロンプト・QA の基準値・再試行の回数
- `reasoning.effort` の調整（今は指定していない＝各モデルの既定。比較でも指定しない。必要なら別途）

## データモデル変更

なし。

## API サーフェス

### 1. 単価表（`lib/llm/pricing.ts`）

| モデル | 入力 | 出力 |
|---|---:|---:|
| `gpt-6-astra` | 10 | 50 |
| `gpt-6-sol` | 2 | 10 |
| `gpt-6-luna` | 0.1 | 0.5 |
| `gpt-5.6-sol`（修正） | 4 | 20 |

`PRICEABLE_MODELS` にも足す。前方一致で探しているので、`gpt-6-sol` と `gpt-6-sol-...`（スナップショット名）の両方で引けること。

### 2. モデルの差し替え

`generateMatchContent`（`lib/llm/pipeline.ts:184`）に任意の引数を足す:

```ts
type ContentModelOverrides = { narrative?: string; fast?: string };
generateMatchContent(matchId, contentType, language = "ja", options?: { models?: ContentModelOverrides })
```

- 渡された値を各段階（`generate-narrative.ts` の 2 か所、`extract-facts.ts`、`qa.ts`、`verify-entities.ts`）へ引き回す。渡されなければ今の `MODELS` を使う
- **本番の呼び出し（orchestrate など）は何も渡さない＝挙動は変わらない**

### 3. 試し焼きスクリプト（`scripts/trial-content-models.ts`）

```
node --env-file=.env.production.local tools/run-ts.cjs scripts/trial-content-models.ts \
  --matches <id>,<id>,... --content-type recap \
  --config current --config gpt6 \
  [--max-usd 5] [--dry-run]
```

- `--config current` は今のモデル、`--config gpt6` は `narrative=gpt-6-sol, fast=gpt-6-luna`。**同じ試合・同じ入力で両方を続けて走らせる**（日をまたいだ比較にしない）
- **`match_content`・`pipeline_runs` などの DB に書き込まない**（読み取りだけ）。公開・通知・IndexNow もしない。書き込みが起きる経路を通らないよう、保存の手前で止める形にする
- 結果は `tmp/model-trial/<日時>/` に出す:
  - `summary.md`: 試合ごと・設定ごとの表（段階別の時間・トークン・費用、QA の各スコア、QA 判定、作り直しの回数、捏造ゲートの結果、本文の文字数）と、設定ごとの平均
  - `<matchId>-<config>.md`: 最終本文（Owner が読み比べる用）
- **費用の上限**: 走らせる前に「試合数 × 設定数 × 1 本あたりの直近平均 × 2（作り直しの余裕）」で見積もりを出し、`--max-usd`（既定 5）を超えるなら止める。`--dry-run` は見積もりだけ出して LLM を呼ばない
- **QA の判定の比較**: `--config gpt6` で作った本文を、今の QA（gpt-5.6-luna）でも採点して、両方の QA の点と判定を並べる（Luna を替えると合否の基準がずれないかを見るため）

### 4. 試す対象（Owner が実行時に決める。推奨）

- recap 4 本: 直近に公開済みの Top 14 第 3 節から 2 本、URC 2025-26 の未処理（公開されていない）から 2 本
- preview 4 本: 9/25〜28 の試合（URC 開幕・プレミアシップ）から、日本語の事実がそろっているもの

推奨の組み合わせでの見積もり: 8 本 × 2 設定 × $0.14 × 2 ≒ **$4.5 以内**（実際は半分程度の見込み）。

## UI サーフェス

なし。

## LLM 連携

- 比較のときだけ LLM を追加で呼ぶ。費用の見積もりは上記。**実行は Owner の承認を得てから**（CLAUDE.md「未キャッシュの LLM 呼び出し」）
- 本番の生成は変えない

## 切り替えの判断（比較の後、Owner が決める）

本文（`NARRATIVE` → `gpt-6-sol`）を切り替える目安:
- QA の各スコアの平均が今と同等以上（1 点以上下がる項目が無い）
- 捏造ゲートの失敗と、作り直しの回数が増えない
- 1 本あたりの費用が今以下
- Owner が 2 組以上を読み比べて、GPT-6 のほうが悪くない

抽出・QA（`FAST` → `gpt-6-luna`）を切り替える目安:
- 同じ本文に対する QA の合否が、今の QA と一致する（食い違いがあれば中身を見て判断）
- 事実抽出の件数と内容が同等

切り替えは別 PR で `MODELS` の値を変え、1 週間は `pipeline_runs` の費用・時間と QA の点を見る。

## 受け入れ条件

1. `calculateCostUsd` が `gpt-6-sol`・`gpt-6-luna`・`gpt-6-astra` と、そのスナップショット名で上の単価を返す。`gpt-5.6-sol` は 4 / 20
2. 表に無いモデルは今までどおり例外を投げる
3. `generateMatchContent` にモデルを渡すと、本文生成・抽出・QA・固有名詞照合の各呼び出しにその値が使われる（`createTextResponse` のモックで `model` を確認）
4. 何も渡さないときは今の `MODELS` が使われる（既存テストが無変更で通る）
5. 試し焼きスクリプトが `match_content`・`pipeline_runs` に書き込まない（DB クライアントのモックで insert/update/upsert が呼ばれないことを確認）。通知・IndexNow も呼ばれない
6. 見積もりが `--max-usd` を超えると LLM を呼ばずに止まる。`--dry-run` は LLM を呼ばない
7. `summary.md` に設定ごとの平均（費用・時間・QA の各スコア・作り直し回数）が出る
8. **壊して落ちる確認**: 条件 3 が「差し替えを無視する実装」で、条件 5 が「保存まで進む実装」で落ちることを一時的に壊して確認し、PR 本文に書く（コミットしない）
9. `pnpm lint`・`pnpm typecheck`・`pnpm test` が通り、CI が緑

## 競合とマージ順

- 触るファイル: `lib/llm/pricing.ts`、`lib/llm/pipeline.ts`、`lib/llm/stages/*.ts`（モデル引数）、新規スクリプトとテスト
- `specs/fix-orchestrate-throughput.md`（#865）は `lib/cron/*` を触る。**ファイルは重ならない**ので並行でよい

## 本番操作

- 試し焼きの実行（LLM 費用あり）。Owner の承認のうえ、Owner か Claude Code が実行する。DB には書き込まない

## 未解決の質問

1. 試す試合（上の推奨でよいか）と費用の上限（既定 $5）

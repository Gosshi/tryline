# LLM モデルを GPT-6 系へ移す

## 背景

Owner の意向（2026-11-16）: 料金と、モデルの提供終了の両面から GPT-6 系へ移したい。

### 今のモデル（`lib/llm/models.ts`、2026-11-16 確認）

| 定数 | 今 | 使う場所 |
|---|---|---|
| `NARRATIVE` | `gpt-5.6-terra` | 本文生成（`lib/llm/stages/generate-narrative.ts:102`・`:155`）、週次ダイジェスト（`app/api/cron/weekly-digest/route.ts:282`） |
| `FAST` | `gpt-5.6-luna` | 事実抽出（`extract-facts.ts:66`）・QA（`qa.ts:735`）・固有名詞照合（`verify-entities.ts:157`・`:184`） |
| `WEB_SEARCH` | `gpt-5.6-terra` | 出典付き事実の収集（`lib/llm/sourced-facts/fetch.ts:698`） |
| `CHAT` | `gpt-4o-mini` | 試合ページの AI チャット（`app/api/chat/[matchId]/route.ts:106`） |

本番の直近 7 日の `match_content` 23 本は、すべて `model_version = gpt-5.6-terra`。

### OpenAI 公式（2026-11-16 確認）

- 料金（USD / 100 万トークン、短い文脈。[pricing](https://developers.openai.com/api/docs/pricing)）は、`lib/llm/pricing.ts` の値と一致している:

| モデル | 入力 | 出力 |
|---|---:|---:|
| gpt-5.6-terra | 2.00 | 12.00 |
| **gpt-6-sol** | 2.00 | **10.00** |
| gpt-5.6-luna | 0.20 | 1.20 |
| **gpt-6-luna** | **0.10** | **0.50** |
| gpt-4o-mini | 0.15 | 0.60 |

- **提供終了**（[deprecations](https://developers.openai.com/api/docs/deprecations)）: `gpt-4o-mini-2024-07-18` は 2026-10-14 に告知済みで、**2027-01-14 に提供終了**。後継として `gpt-6-luna` が推奨されている。GPT-5.6 系には提供終了の告知が無い
- `gpt-6-sol`・`gpt-6-luna` は、どちらも Responses API・構造化出力・Web 検索に対応する推論モデル。`reasoning.effort` は `none`〜`max`、既定は `medium`。`gpt-6-luna` は Chat Completions とストリーミングにも対応する

### 9/24 の比較で分かっていないこと

`specs/feat-llm-model-trial-gpt6.md` の試し焼き（`scripts/trial-content-models.ts`）は、本文と抽出・QA のモデルを**同時に**替える `gpt6` 設定しか持たない。どちらの変更が結果を動かしたのか切り分けられていない（`docs/recap-originality-review-2026-09-24.md` §5）。また、使った試合は Top 14・URC で、今の対象（国際試合・リーグワン）と違う。

## スコープ

### 段階と担当

| 段階 | 内容 | 担当 | 本番の挙動 |
|---|---|---|---|
| **A（この spec の PR）** | ① チャットを `gpt-6-luna` へ ② 試し焼きに「片方だけ替える」設定を足す | Codex | ①だけ変わる |
| B | 試し焼きの実行（LLM 費用あり） | Owner 承認のうえ Claude Code | 変わらない（DB に書かない） |
| C | `FAST`・`NARRATIVE` の既定値を替える | Codex（B の結果を見て Owner が決めてから） | 変わる |
| D | `WEB_SEARCH` を替える | 別 spec（C の 1 週間後） | — |

対象（この spec の PR = 段階 A）:
1. `MODELS.CHAT` を `gpt-6-luna` にし、チャットの呼び出しを推論モデルで動く形に合わせる
2. `scripts/trial-content-models.ts` に設定 `fast6`（抽出・QA・固有名詞照合だけ `gpt-6-luna`）と `sol`（本文だけ `gpt-6-sol`）を足す

対象外:
- `MODELS.FAST`・`NARRATIVE`・`WEB_SEARCH` の既定値（段階 C・D）
- プロンプト・QA の基準値・再試行の回数
- 記事生成側の `reasoning.effort`（今は指定せず各モデルの既定。比較でも指定しない）
- 過去の記事の作り直し（2026-09-25 Owner 方針）

## データモデル変更

なし。

## API サーフェス

### 1. チャット（`app/api/chat/[matchId]/route.ts`）

- `MODELS.CHAT = "gpt-6-luna"`
- `chat.completions.create` に `reasoning_effort: "none"` を渡す。チャットは渡した試合の文脈に答えるだけで、推論の深さより応答の速さを優先する。既定の `medium` だと、推論に使ったトークンが下記の上限を食い、本文が空のまま終わるおそれがある
- 出力の上限は今と同じ 1024 トークン。**`max_tokens` を推論モデルが受け付けるかは、インストール済みの `openai` SDK の型とドキュメントで確認する**。受け付けないなら `max_completion_tokens: 1024` にする。どちらにしたかを PR 本文に書く
- ストリーミング・`stream_options`・回数制限・保存処理は変えない

### 2. 試し焼きの設定（`scripts/trial-content-models.ts`）

| 設定 | narrative | fast |
|---|---|---|
| `current`（既存） | 既定（`MODELS`） | 既定 |
| `gpt6`（既存） | `gpt-6-sol` | `gpt-6-luna` |
| **`fast6`（新規）** | 既定 | `gpt-6-luna` |
| **`sol`（新規）** | `gpt-6-sol` | 既定 |

- 今の「`current` と `gpt6` の両方が必須」（`:91-96`）を、「`current` を必ず含み、ほかに 1 つ以上」に変える
- `fast` を `gpt-6-luna` にする設定（`gpt6`・`fast6`）は、既存の `gpt6` と同じく、作った本文を今の QA（`MODELS.FAST`）でも採点して並べる（`comparisonQaModel`、`:394`）。**`sol` は QA を替えないので比較採点しない**
- 費用見積もり（試合数 × 設定数 × 直近平均 × 2）と `--max-usd` の停止は、設定数が 3 以上でもそのまま使う
- `summary.md` の表と平均に、新しい設定の行が出る

## UI サーフェス

なし（チャットの見た目は変えない）。

## LLM 連携

- 段階 A の本番影響はチャットだけ。1 メッセージの単価は、入力が 2/3、出力が 5/6 になる（$0.15/$0.60 → $0.10/$0.50）。ただし推論トークンは出力として課金されるので、`reasoning_effort: "none"` にする
- 段階 B の見積もり（Owner 承認が必要。CLAUDE.md「未キャッシュの LLM 呼び出し」）:
  - recap 4 本 × 3 設定（`current`・`fast6`・`sol`）= 12 回 × 直近平均 約 $0.14 × 2（作り直しの余裕）≒ **$3.4**。`--max-usd 4`
  - 対象の 4 試合（11/14〜15 の国際試合。どれも recap 公開済みで、入力がそろっている）: イングランド対日本（一方的な試合）、ウェールズ対ニュージーランド（接戦・出典付きの事実あり）、フランス対南アフリカ（2 点差）、イタリア対アルゼンチン（ペナルティトライあり）
  - 試し焼きは DB に書かないので、公開中の記事は変わらない

## 切り替えの判断（段階 C の前に Owner が決める）

`FAST` → `gpt-6-luna`（`fast6` と `current` を比べる）:
- 同じ本文に対する QA の合否が、今の QA と 4 本とも一致する。食い違いは中身を読んで、どちらが正しいかを判断する
- 事実抽出の件数と、捏造ゲート・固有名詞照合の結果が同等

`NARRATIVE` → `gpt-6-sol`（`sol` と `current` を比べる）:
- QA の各スコアの平均で、1 点以上下がる項目が無い
- 作り直しの回数と、捏造ゲートの失敗が増えない
- 1 本あたりの総費用（抽出・QA・作り直しを含む）が今以下
- Owner が 2 組以上を読み比べて、悪くなっていない

片方だけ合格なら、合格した方だけ替える。

### 段階 C をマージしない期間

- **11/20〜11/21**: 日本対スコットランド（11/21 23:10 JST）のプレビュー
- **12/9〜12/13**: リーグワン開幕節のプレビュー生成（12/11 15:00 の cron）と開幕節

切り替え後 1 週間は、`pipeline_runs` の費用・時間と、QA の点・却下率を見る。

## 受け入れ条件（段階 A）

1. チャットの route が `model: "gpt-6-luna"` と `reasoning_effort: "none"` で `chat.completions.create` を呼ぶ（OpenAI クライアントのモックで引数を確認）
2. 出力上限 1024 が、SDK の型で受け付けられるパラメータ名で渡っている（`pnpm typecheck` が通り、テストで値を確認）
3. チャットの既存テスト（`tests/api/chat-rate-limit.test.ts`・`tests/api/me-chat-free.test.ts` など）が、モデル名の期待値以外は変えずに通る
4. 試し焼きで `--config current --config fast6` を渡すと、`fast6` の各段階の呼び出しが、抽出・QA・固有名詞照合では `gpt-6-luna`、本文では `MODELS.NARRATIVE` になる（`createTextResponse` のモックで `model` を確認）
5. `--config current --config sol` を渡すと、本文だけが `gpt-6-sol` になり、ほかは `MODELS.FAST`。比較採点は行われない
6. `--config fast6` だけ（`current` なし）では例外で止まり、LLM を呼ばない
7. 3 設定（`current`・`fast6`・`sol`）で、見積もりが「試合数 × 3 × 平均 × 2」になり、`--max-usd` を超えると LLM を呼ばずに止まる
8. 既存の `current`＋`gpt6` の比較は、今までどおり動く（`tests/scripts/trial-content-models.test.ts` の既存の期待値を弱めない）
9. 試し焼きは、どの設定でも `match_content`・`pipeline_runs` に書き込まない（既存のテストを新しい設定でも回す）
10. **壊して落ちる確認**: (a) `fast6` の対応を `undefined` にする、(b) チャットから `reasoning_effort` を外す、の 2 つで、それぞれ条件 4・1 のテストが落ちることを一時的に壊して確認する。出力を PR 本文に貼る（コミットしない）
11. `pnpm lint`・`pnpm typecheck`・`pnpm test`・`pnpm build` が通り、CI が緑

## 競合とマージ順

- 触るファイル: `lib/llm/models.ts`（`CHAT` の 1 行）、`app/api/chat/[matchId]/route.ts`、`scripts/trial-content-models.ts`、それぞれのテスト
- 進行中の spec で、これらのファイルを触るものは無い（2026-11-16 時点）
- **CHAT の提供終了は 2027-01-14。段階 A は 12 月中にマージする**

## 本番操作

- 段階 A のマージ後、Claude Code が本番のチャットで 1 問だけ試し、本文が返ること・`Unsupported model` 等のエラーが Vercel のログに出ないことを確認する
- 段階 B（試し焼き）は Owner の承認のうえ、Claude Code が実行する

## 未解決の質問

1. ~~段階 B の費用上限~~ → **解決（2026-11-16 Owner 承認）: 4 試合 × 3 設定、上限 $4。段階 A のマージ後に実行する**
2. CLAUDE.md の技術スタックの記述（「抽出・QA は gpt-4o-mini、ナラティブは gpt-4o」）は 8/7 から古い。段階 C の後に Owner が直すか

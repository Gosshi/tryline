# コンテンツ生成パイプライン

## 背景

Tryline は、構造化された試合データから OpenAI の LLM で自然な日本語のプレビュー・レビューを生成します。このパイプラインはプロダクトの核です。

パイプラインは試合単位で、キックオフ時刻に紐づいたスケジュールで実行されます。生成コンテンツはキャッシュされ、すべてのユーザーに配信されます。生成時にパーソナライズはしません。

**D009 により Phase 1 は 4 段階構成**（集約 → 事実抽出 → ナラティブ → 品質評価）。元の 5 段階設計にあった Reddit フィルタ段階は、Reddit Responsible Builder Policy（2025-11）による API 事前承認待ちのため Phase 1 から外します。ナラティブ段階は `additionalSignals` 引数（空配列でも動作）で将来の外部シグナル段階を受け取れる形にしておき、Reddit 承認または他ソース採用時に段階を挿入するだけで済むように設計します。

## スコープ

対象:
- プレビュー（T-48h）とレビュー（T+1h）の 4 段階生成パイプライン
- データモデルは共通だが、プロンプトと入力は異なる
- QA 失敗時のリトライロジック（最大 2 回）
- パイプライン実行ごとのコスト追跡
- ナラティブ段階が `additionalSignals: AdditionalSignal[]` を受け取るインターフェース（Phase 1 では常に空配列を渡す）

対象外:
- Reddit ingestion / フィルタ段階（`specs/p1-reddit-ingestion.md` は Reddit 承認まで実装保留）
- 他ソース（公式プレス、RugbyPass 等）からの外部シグナル収集（承認済みソースが出た時点で別仕様書）
- AI チャット（別仕様書 `p1-ai-chat.md`）
- パーソナライズ
- 試合中のライブ更新
- 日本語以外の言語対応

## データモデル変更

新規テーブル:

```sql
-- LLM 出力キャッシュ
match_content (
  id uuid primary key,
  match_id uuid references matches not null,
  content_type text not null check (content_type in ('preview', 'recap', 'tactical_notes')),
  content_md_ja text not null,
  model_version text not null,                 -- 物理バージョン（例: 'gpt-4o-2024-11-20'）
  prompt_version text not null,                -- プロンプトテンプレートの semver（例: 'preview@1.0.0'）
  status text not null default 'draft'
    check (status in ('draft', 'published', 'rejected')),
  generated_at timestamptz not null default now(),
  qa_scores jsonb not null,
  unique (match_id, content_type)
);

-- デバッグ用パイプライン実行ログ
pipeline_runs (
  id uuid primary key,
  match_id uuid references matches,
  content_type text not null,
  stage integer not null,
  input_hash text,
  output jsonb,
  cost_usd numeric,
  duration_ms integer,
  status text check (status in ('success', 'retry', 'failed')),
  error_message text,
  created_at timestamptz not null default now()
);
```

インデックス:
- 試合ページでの参照用: `match_content (match_id, content_type)`
- 公開状態フィルタ用: `match_content (status, match_id, content_type)` — `/matches/[id]` は `status = 'published'` のみ読む
- デバッグ用: `pipeline_runs (match_id, stage)`

`model_version` / `prompt_version` の意図:
- `model_version` は OpenAI が返す **物理モデル ID**（`gpt-4o-2024-11-20` 等）を保存する。`MODELS.NARRATIVE` の論理名だけだと、OpenAI 側で背後バージョンが更新されたときに再生成対象を特定できない
- `prompt_version` は `/lib/llm/prompts/*.ts` 側で semver 文字列を定数エクスポートし、呼び出し時に書き込む。プロンプト改訂時は旧コンテンツの再生成判定に使う

`status` の運用（`Q3 / a` の決定事項）:
- 段階 4 の verdict が `publish` → パイプラインが自動的に `status = 'published'` にして `match_content` へ upsert
- 段階 4 の verdict が `reject`（リトライ上限後）→ `status = 'draft'`（または `'rejected'`、下記参照）で保存し、Slack 通知
- Owner は Supabase Studio で `status` カラムを手動更新することで公開可否を切り替える。MVP では管理 UI を作らない
- `reject` 時の挙動は「`draft` で保存して Slack 通知する」「`rejected` で保存して Slack 通知する」の 2 択があるが、本仕様書は **`draft` で保存する**。理由: Owner が Studio で `'published'` に上げるのが通常運用、`'rejected'` は Owner が明示的に却下した場合のみ使う予約値とする

## パイプライン段階

### 段階 1: 集約

純粋なデータ集約。LLM は使わない。

入力: `match_id`
出力: 試合メタデータ、両チームの直近 5 試合、過去対戦 5 試合、予想スタメン、故障情報、主要スタッツ（得失点平均）を含む JSON

配置: `/lib/llm/stages/assemble.ts`

### 段階 2: 事実抽出

入力: 段階 1 の JSON
モデル: `MODELS.FAST`（D008、現時点の実 ID は `gpt-4o-mini`）
プロンプト: `/lib/llm/prompts/extract-tactical-points.ts`

出力: 戦術ポイント 3 つの JSON 配列。各ポイントは `point`、`detail`（120 字の日本語）、`evidence`（参照の配列）を持つ。

受け入れ条件:
- 一般論（「両チーム好調」など）を却下する
- 3 つとも具体的なスタッツまたは直近試合を参照する
- 出力は有効な JSON であり、散文ではない

### 段階 3: ナラティブ生成

入力: 段階 1 の JSON + 段階 2 出力 + `additionalSignals: AdditionalSignal[]`（Phase 1 は常に空配列）
モデル: `MODELS.NARRATIVE`（D008、現時点の実 ID は `gpt-4o`）
プロンプト: `/lib/llm/prompts/generate-preview.ts` または `generate-recap.ts`

`AdditionalSignal` 型（拡張点、`/lib/llm/types.ts` に定義）:

```typescript
type AdditionalSignal = {
  source: 'reddit' | 'official_press' | 'editorial';  // 将来の union 拡張
  summary_ja: string;     // 日本語要約 1 行
  evidence_refs: string[]; // 原文 URL 等、配信には使わない
};
```

プロンプトテンプレート側で `additionalSignals.length === 0` の場合は「外部シグナルなし」ブロック自体を省略する（空配列でもプロンプトが壊れないこと）。

出力: 日本語マークダウン。プレビュー約 1,500 字、レビュー約 2,000 字

プレビューの構成:
1. 両チームの現状（400〜500 字）
2. 段階 2 から展開した戦術ポイント（600〜700 字）
3. キープレイヤーと予想（300〜400 字）

レビューの構成:
1. 試合の全体像
2. ターニングポイント
3. MOM 選出と根拠
4. 次戦以降への示唆

受け入れ条件:
- 自然な日本語で、機械翻訳の痕跡がない
- ラグビー用語が適切に使われている
- `additionalSignals` を受け取った場合は距離を取った表現で帰属する（「海外ファンの間では〜との議論もある」「公式声明では〜」など）。Phase 1 では空配列なので本条件は空振りする
- いずれのソースからも 15 語を超える直接引用なし
- 数値的事実が段階 1 の入力と一致する

### 段階 4: 品質評価

入力: 段階 3 出力
モデル: `MODELS.FAST`
プロンプト: `/lib/llm/prompts/qa-content.ts`

出力:
```json
{
  "scores": {
    "information_density": 1-5,
    "japanese_quality": 1-5,
    "factual_grounding": 1-5
  },
  "issues": ["問題点のリスト"],
  "verdict": "publish" | "retry" | "reject"
}
```

判定ロジック:
- すべてのスコアが 3 以上 → publish（`match_content.status = 'published'` で upsert）
- いずれかが 2 以下 → retry（段階 3 を別の temperature で再実行、下記「リトライ戦略」参照）
- 2 回のリトライ後も通過しない → reject（`match_content.status = 'draft'` で upsert + Slack 通知、Owner が Supabase Studio で手動公開可否を判断）

### リトライ戦略（`Q2` の決定事項）

段階 3 のナラティブは既に `MODELS.NARRATIVE`（最上位モデル）を使用しているため、**モデル昇格はしない**。temperature の振幅のみで挙動を変える。

- 初回: `temperature = 0.7`
- リトライ 1 回目: `temperature = 0.9`（発想の幅を広げる方向）
- リトライ 2 回目: `temperature = 0.4`（事実寄りに引き締める方向）
- それでも QA が通らなければ reject

段階 4 の QA 自体が JSON パース不能で返した場合に限り、**同一入力で 1 回だけ再実行**する（判定ロジック外の保護）。2 回目も JSON 不能なら pipeline_runs に `failed` で記録し、段階 3 出力を `status = 'draft'` で保存。

段階 2 の事実抽出が JSON 不能な場合も同様に 1 回だけ再実行。2 回目も不能ならパイプライン全体を abort し、`pipeline_runs.status = 'failed'` で記録する。

## API サーフェス

内部用のみ。クライアントには公開しない。

```typescript
// /lib/llm/pipeline.ts
export async function generateMatchContent(
  matchId: string,
  contentType: 'preview' | 'recap'
): Promise<PipelineResult>

// Cron エンドポイント
POST /api/cron/generate-content
  Headers: Authorization: Bearer <CRON_SECRET>
  Body: { matchIds: string[], contentType: 'preview' | 'recap' }
```

## UI サーフェス

UI は直接持たない。生成コンテンツは `p1-match-pages.md`（試合詳細ページ、既存）と、後続仕様書 `p1-match-content-display.md`（`ContentPlaceholder` を実コンテンツに差し替える改訂、Claude Code が別 PR で起票）経由で読まれる。読み取り条件は `match_content.status = 'published'` のみ。

## 実行タイミング（`Q1` の決定事項）

本仕様書に含まれる cron エンドポイント `POST /api/cron/generate-content` は、Owner 指定の `matchIds` を同期的に処理する最小構成。実際のスケジューリング（Vercel Cron）は後続仕様書 `p1-pipeline-scheduling.md` で別途定義するが、想定タイミングは以下で固定する:

- **プレビュー**: キックオフの **T-48h** に生成。ローンチ前の大会開幕日はバックフィルで全試合一括実行
- **レビュー**: 試合終了（`matches.status = 'finished'`）から **T+1h** で即時生成。公式詳細スタッツの到着を待たない

T+1h 即時を採用する理由: 日本時間で Six Nations の試合終了は早朝になるため、通勤時刻までにレビューが読める UX を優先する。Wikipedia の記事は試合終了直後にスコアと主要イベント（トライ・カード）が反映され、レビューの 4 章構成（全体像 / ターニングポイント / MOM / 次戦示唆）は主要イベントのみで成立する。詳細スタッツの遅延により品質劣化が顕著であれば Phase 2 で遅延オプションを追加検討する。

## コスト目標（D010 で確定）

OpenAI 価格（2026-04 時点の概算、Codex は実装前に OpenAI 公式価格ページで最終確認すること）による 1 試合あたりコスト:

| 段階 | モデル | 入力 tok | 出力 tok | 単価 × 試算 |
|---|---|---|---|---|
| 1 集約 | なし | — | — | $0.00 |
| 2 事実抽出 | `MODELS.FAST`（`gpt-4o-mini`） | ~3,000 | ~500 | ~$0.001 |
| 3 ナラティブ（プレビュー 1,500 字） | `MODELS.NARRATIVE`（`gpt-4o`） | ~3,500 | ~2,500 | ~$0.034 |
| 3 ナラティブ（レビュー 2,000 字） | `MODELS.NARRATIVE`（`gpt-4o`） | ~3,500 | ~3,500 | ~$0.044 |
| 4 QA | `MODELS.FAST` | ~3,000 | ~200 | ~$0.0006 |

**1 試合あたりの上限**:
- プレビュー: ~$0.035（リトライ 2 回の最悪値で ~$0.10）
- レビュー: ~$0.045（リトライ 2 回の最悪値で ~$0.13）
- Six Nations 2027（15 試合 × preview+recap）の大会合計: 最悪でも ~$4

**アラート方針（`Q3 / d` の決定事項）**:
- 閾値: 1 試合あたり $0.20（上記最悪値 + 余裕）
- Phase 1 は通知を実装しない。`pipeline_runs.cost_usd` の集計クエリを Owner が定期確認する運用で回す
- 閾値超過が 2 回連続で発生したら Owner 判断で Phase 2 前倒しで Slack webhook 連携を追加
- Slack 連携は `p1-observability.md`（後続仕様書）に含める予定

## 受け入れ条件

- [ ] `match_content` に `status` / `model_version` / `prompt_version` カラムが存在し、check 制約が効いている
- [ ] `match_content (status, match_id, content_type)` のインデックスが作成されている
- [ ] `model_version` に OpenAI が返す物理モデル ID（`gpt-4o-2024-11-20` 等）が保存される（`MODELS.NARRATIVE` の論理名ではない）
- [ ] `prompt_version` が `/lib/llm/prompts/*.ts` から semver でエクスポートされ、呼び出し時に書き込まれる
- [ ] Six Nations 2027 の 15 試合について、プレビュー + レビューがエンドツーエンドで手動介入なしに生成される
- [ ] パイプラインは 1 試合あたり 30 秒以内に完了する
- [ ] QA リトライが機能する。段階 3 は temperature `0.7 → 0.9 → 0.4` の順で最大 2 回リトライ
- [ ] 段階 2 / 段階 4 が JSON パース不能な場合は同一入力で 1 回だけ再実行される
- [ ] QA verdict が `publish` の場合、`match_content.status = 'published'` で upsert される
- [ ] QA verdict が `reject`（リトライ上限後）の場合、`match_content.status = 'draft'` で upsert され、Slack 通知がスキップされず送信可能な形で（webhook URL 未設定でも実装自体は存在して）コードに残る。Slack webhook 実装自体は Phase 2（`p1-observability.md`）で良いが、呼び出し地点は Phase 1 で確保する
- [ ] `/matches/[id]` のコンテンツ読み出しは `status = 'published'` のみが対象（`p1-match-content-display.md` で差し替え PR）
- [ ] `match_content` テーブルにスクレイプした生テキストが一切含まれない（LLM が書き直した日本語のみ）
- [ ] ナラティブ段階が `additionalSignals` 引数を受け取り、空配列でも正常に生成できる（Phase 1 実装時の動作確認）
- [ ] すべての LLM 呼び出しについて `pipeline_runs` にコスト追跡行（`cost_usd`）が書き込まれる
- [ ] Owner が 10 件の生成プレビューをレビューし、7 件以上を「公開して良い」と判定

## 決定事項（旧「未解決の質問」からの確定、D010）

Owner 決定（2026-04-24）。以下は Codex への指示として扱う。

1. **レビュー生成タイミング**: 試合終了後 **T+1h で即時実行**。公式詳細スタッツの到着を待たない（上記「実行タイミング」参照）
2. **リトライ戦略**: 段階 3 は **temperature の振幅のみ**（`0.7 → 0.9 → 0.4`）。モデル昇格は行わない。段階 2 / 段階 4 の JSON パース不能は同一入力で 1 回だけ再実行
3. **手動レビューフロー**: **Slack 通知 + Supabase Studio 運用**。`match_content.status` カラムの手動更新で公開可否を切り替える。管理 UI は Phase 2 以降
4. **Reddit 却下時の代替外部シグナル**: **Phase 1 では追加しない**。`additionalSignals: []` 前提で成立させる。Reddit 承認結果（目安 7 日）を待ち、却下時は Phase 1 後半で別仕様書を起票
5. **`match_content.status` カラム追加**: 採用する（`draft` / `published` / `rejected`）
6. **`model_version` 書式**: OpenAI が返す **物理バージョン**（`gpt-4o-2024-11-20` 等）
7. **`prompt_version` カラム追加**: 採用する。semver 文字列（`'preview@1.0.0'` 等）
8. **コストアラート**: Phase 1 は `pipeline_runs.cost_usd` の **DB クエリで監視**。Slack 連携は Phase 2（`p1-observability.md`）

## 未解決の質問

現時点なし。疑問が生じた場合は Codex が実装前に Owner に確認する。

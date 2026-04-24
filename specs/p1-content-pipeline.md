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
  model_version text not null,
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
- デバッグ用: `pipeline_runs (match_id, stage)`

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
- すべてのスコアが 3 以上 → publish（公開）
- いずれかが 2 以下 → retry（段階 3 を別の temperature で再実行）
- 2 回のリトライ後も通過しない → reject、手動レビューキューへ

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

UI は直接持たない。生成コンテンツは既存の試合詳細ページ仕様 `p1-match-detail-page.md` 経由で読まれる。

## コスト目標

D003 の Claude 前提見積り（プレビュー $0.08〜0.12 / レビュー $0.15〜0.20）は D008 による OpenAI 切り替えで要再算出。本仕様書の実装着手前に、`MODELS.FAST` / `MODELS.NARRATIVE` の最新価格で試算し直し、このセクションを更新する（Codex プロンプト側で明示）。

目標超過のアラート方針（50% 超過でアラート）は維持する。

## 受け入れ条件

- [ ] Six Nations 2027 の 15 試合について、プレビュー + レビューがエンドツーエンドで手動介入なしに生成される
- [ ] パイプラインは 1 試合あたり 30 秒以内に完了する
- [ ] QA リトライが機能する。段階あたり最大 2 回
- [ ] `match_content` テーブルにスクレイプした生テキストが一切含まれない（LLM が書き直した日本語のみ）
- [ ] ナラティブ段階が `additionalSignals` 引数を受け取り、空配列でも正常に生成できる（Phase 1 実装時の動作確認）
- [ ] すべての LLM 呼び出しについて `pipeline_runs` にコスト追跡行が書き込まれる
- [ ] Owner が 10 件の生成プレビューをレビューし、7 件以上を「公開して良い」と判定

## 未解決の質問

1. レビュー生成は公式マッチレポート公開を待つか、T+1h 時点で即時実行するか（Phase 1 は外部シグナルなしで走るので、即時 vs 遅延の品質差を検証する必要）
2. リトライ時は別モデル（QA を `MODELS.FAST` → `MODELS.NARRATIVE`）にするか、temperature だけ変えるか
3. 管理画面に手動レビューキュー UI が必要か、MVP では Slack 通知で十分か
4. Reddit 承認が下りなかった場合の代替外部シグナル源（公式プレス、RugbyPass 等）を Phase 1 中に試行するか、Phase 2 に送るか

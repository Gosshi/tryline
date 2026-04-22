# コンテンツ生成パイプライン

## 背景

Tryline は、構造化された試合データとフィルタリングした議論シグナルを組み合わせて、Claude で自然な日本語のプレビュー・レビューを生成します。このパイプラインはプロダクトの核です。

パイプラインは試合単位で、キックオフ時刻に紐づいたスケジュールで実行されます。生成コンテンツはキャッシュされ、すべてのユーザーに配信されます。生成時にパーソナライズはしません。

## スコープ

対象:
- プレビュー（T-48h）とレビュー（T+1h）の 5 段階生成パイプライン
- データモデルは共通だが、プロンプトと入力は異なる
- QA 失敗時のリトライロジック（最大 2 回）
- パイプライン実行ごとのコスト追跡

対象外:
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
モデル: Claude Haiku
プロンプト: `/lib/llm/prompts/extract-tactical-points.ts`

出力: 戦術ポイント 3 つの JSON 配列。各ポイントは `point`、`detail`（120 字の日本語）、`evidence`（参照の配列）を持つ。

受け入れ条件:
- 一般論（「両チーム好調」など）を却下する
- 3 つとも具体的なスタッツまたは直近試合を参照する
- 出力は有効な JSON であり、散文ではない

### 段階 3: Reddit フィルタ

入力: r/rugbyunion の試合スレッド投稿（プレビュー: pre-match thread、レビュー: post-match thread）
事前フィルタ: upvotes >= 20、本文 >= 100 字、48 時間以内の投稿
モデル: Claude Haiku
プロンプト: `/lib/llm/prompts/filter-reddit.ts`

出力: 戦術的価値でランク付けされた上位 5〜10 件の投稿 + 各 1 行の日本語要約

受け入れ条件:
- 純粋な応援（「いけ！」）、ミーム、人身攻撃を除外
- 戦術分析、選考論評、選手のコンディション議論を含める
- 英語原文を配信用に返さない。日本語要約のみ返す

### 段階 4: ナラティブ生成

入力: 段階 1 の JSON + 段階 2 出力 + 段階 3 出力
モデル: Claude Sonnet
プロンプト: `/lib/llm/prompts/generate-preview.ts` または `generate-recap.ts`

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
- Reddit 由来の情報は距離を取った表現で帰属される（「海外ファンの間では〜との議論もある」など）
- いずれのソースからも 15 語を超える直接引用なし
- 数値的事実が段階 1 の入力と一致する

### 段階 5: 品質評価

入力: 段階 4 出力
モデル: Claude Haiku
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
- いずれかが 2 以下 → retry（段階 4 を別の temperature で再実行）
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

- プレビュー: 1 試合あたり $0.08〜0.12
- レビュー: 1 試合あたり $0.15〜0.20

目標を 50% 超過したらアラート。

## 受け入れ条件

- [ ] Six Nations 2027 の 15 試合について、プレビュー + レビューがエンドツーエンドで手動介入なしに生成される
- [ ] パイプラインは 1 試合あたり 30 秒以内に完了する
- [ ] QA リトライが機能する。段階あたり最大 2 回
- [ ] `match_content` テーブルにスクレイプした生テキストが一切含まれない（LLM が書き直した日本語のみ）
- [ ] ナラティブで参照される Reddit 投稿は距離を取った表現で帰属される
- [ ] すべての LLM 呼び出しについて `pipeline_runs` にコスト追跡行が書き込まれる
- [ ] Owner が 10 件の生成プレビューをレビューし、7 件以上を「公開して良い」と判定

## 未解決の質問

1. レビュー生成は公式マッチレポート公開を待つか、T+1h 時点で Reddit シグナルのみで実行するか
2. リトライ時は別モデル（QA を Haiku → Sonnet）にするか、temperature だけ変えるか
3. 管理画面に手動レビューキュー UI が必要か、MVP では Slack 通知で十分か

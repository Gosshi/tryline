# アーキテクチャ

## データフロー

```
公開ソース → スケジュール実行のスクレイパー → Supabase raw_data
                                                   ↓
                                              LLM パイプライン（5 段階）
                                                   ↓
                                              Supabase コンテンツキャッシュ
                                                   ↓
                                              Next.js API ルート → クライアント
```

## コアデータモデル

Match が中心エンティティ。すべてのコンテンツ、チャット、ユーザー操作は match_id を参照します。

```
competitions       — リーグ・トーナメント
teams              — 各大会に参加する代表／クラブ
players            — team_id に紐づく選手
matches            — 試合（このモデルのハブ）
match_raw_data     — スクレイプした生データ、短期保持
match_content      — LLM 生成コンテンツ、試合ごとにキャッシュ
match_events       — 得点イベント、カード、交代
users              — 認証、サブスクプラン、関心設定
match_chats        — ユーザー × 試合の会話状態
```

## コンテンツパイプライン（Phase 1 は 4 段階）

完全な仕様は `/specs/p1-content-pipeline.md` を参照。D009 により Phase 1 は 4 段階で運用し、Reddit フィルタ段階は Responsible Builder Policy 承認後に追加する。

概要:

1. **集約** — 生データを構造化 JSON に整理、LLM は使わない
2. **事実抽出** — `MODELS.FAST`（`gpt-4o-mini`）が直近の試合データから戦術ポイント 3 つを抽出
3. **ナラティブ** — `MODELS.NARRATIVE`（`gpt-4o`）が日本語 1,500 字のプレビュー・レビューを生成。`additionalSignals` 引数（Phase 1 は空配列）で将来の外部シグナル段階を受け取れる形
4. **品質チェック** — `MODELS.FAST` が 3 軸で評価、リトライまたは公開

将来の段階（Phase 1 では非実装）:
- **外部シグナル収集**（Reddit 承認後に段階 3 として挿入、または他ソース）— 試合スレッド等の戦術的価値を判定し、`AdditionalSignal[]` 形式でナラティブに渡す

1 試合あたりのコスト: OpenAI 価格で再試算予定（`specs/p1-content-pipeline.md` 着手時）

## スクレイピングルール

- すべてのスクレイパーは取得前に robots.txt を確認する
- レート制限: ドメインあたり 1 リクエスト / 3 秒
- User-Agent は Tryline bot であることを明示し、連絡先メールアドレスを含める
- 失敗時はログに記録し、指数バックオフでリトライ
- 生 HTML は 7 日間キャッシュ後に削除

## LLM 利用予算

D010 で OpenAI 価格による 1 試合あたりコストを確定（詳細は `specs/p1-content-pipeline.md` のコスト目標セクション）:

- プレビュー: ~$0.035（リトライ 2 回の最悪値 ~$0.10）
- レビュー: ~$0.045（リトライ 2 回の最悪値 ~$0.13）
- Six Nations 2027（15 試合 × preview+recap）合計: 最悪でも ~$4
- AI チャットコストは `p1-ai-chat.md`（後続仕様書）着手時に別途試算

原則は不変:
- 試合あたり固定コストはユーザー数に依存しない（`match_id` 単位で共有キャッシュ）
- AI チャットのみユーザー単位の変動コスト
- アプリケーション層で上限を強制する。無料層: 1 日 5 回のチャットまで。Premium: 無制限
- コスト監視は Phase 1 では `pipeline_runs.cost_usd` の DB クエリのみ。Slack 連携は Phase 2（`p1-observability.md`）

## セキュリティモデル

- すべてのユーザースコープテーブルに Supabase RLS 適用
- Stripe 顧客 ID のみ保存、決済情報は自前 DB に持たない
- API ルート: 認証必須（公開プレビューページを除く）
- 管理画面: 別認証、IP 制限
- シークレットは Vercel 環境変数で管理、コミット禁止

## デプロイ

- main ブランチ: 本番、Vercel 自動デプロイ
- PR プレビュー: 自動生成
- マイグレーション: ローカル CLI から本番に手動実行
- cron: 取り込みは Vercel Cron、重い LLM バッチ処理は Supabase Edge Functions

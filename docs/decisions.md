# 意思決定記録

アーキテクチャ上の決定を記録します。追記のみ、書き換えません。各決定には日付、背景、決定内容、影響を記載します。

## D001 — Next.js 15（App Router）を採用（2026-05）

**背景**: プレビュー・レビューページの SEO のため SSR が必要。LLM 呼び出しの API ルートも必要。Owner は既習。

**決定**: Next.js 15 App Router + RSC。

**影響**: SEO 向けの SSR がシームレス。RSC の新しいパターンへの学習コストは受容する。

## D002 — Supabase を採用（セルフホスト postgres は不採用、2026-05）

**背景**: DB + auth + RLS を運用負担なく使いたい。Stripe 連携も上に載せる前提。

**決定**: Supabase で DB、auth、Edge Functions を担う。

**影響**: ベンダーロックインを受容。スキーママイグレーションは Supabase CLI 経由。RLS を主要なセキュリティ境界とする。

## D003 — コスト制御のため Haiku と Sonnet を使い分け（2026-05）

**背景**: コンテンツパイプラインは 5 段階あり、段階ごとに品質要求が異なる。Haiku は Sonnet の約 1/20 のコスト。

**決定**: Haiku を段階 1・2・3・5（抽出・QA）に、Sonnet を段階 4（ナラティブ生成）のみに使用。

**影響**: 日本語品質を 1 段階に集中させる。プレビューあたり LLM コストを $0.15 以下に抑制。Haiku の日本語品質を抽出タスクで検証する必要あり。

## D004 — 試合中心のデータモデル（2026-05）

**背景**: コンテンツを「ユーザー単位（パーソナライズドフィード）」か「試合単位（共有キャッシュ）」で構成するかの選択。

**決定**: Match を中心エンティティとし、試合ごとに 1 回生成して全ユーザーに配信。

**影響**: LLM コストが劇的に削減される。パーソナライズはフィルタと UI で実現し、コンテンツの再生成はしない。ユーザー固有コンテンツは AI チャットに限定。

## D005 — Freemium + ¥980/月 Premium の価格設定（2026-05）

**背景**: 日本のラグビーファンは既に DAZN（¥2,600〜4,200）や J SPORTS に支払っている。追加サブスクは同じ土俵で競合すべきでない。

**決定**: Freemium モデル。無料層は主要大会の基本コンテンツを提供。Premium ¥980/月 ですべての大会、完全版コンテンツ、無制限 AI チャット、Discord が解放される。

**影響**: サインアップのハードルが下がる。ファネルは無料ユーザーの 3〜5% の有料転換に依存。プラン間の価値差を明確にする必要あり。

## D006 — Rugby Championship 2026 を MVP ローンチ対象に（2026-05）

**背景**: ドッグフード対象の大会が必要。選択肢は RC（8〜10月）、日本代表サマー／オータムツアー（試合数少）、リーグワン後半戦（12〜3月）。

**決定**: Rugby Championship。12 試合、戦術レベルが高く、日本語コンテンツが薄い海外リーグ。

**影響**: 2026年 8 月初旬に MVP を間に合わせるハードデッドライン。最優先でスクレイパーを RC のデータソース（オールブラックス、ワラビーズ、スプリングボクス、プーマス）に対応させる。

## D007 — MVP ローンチ対象を Six Nations 2027 に変更（2026-04、D006 を supersede）

**背景**: 2026 年の Rugby Championship は World Rugby のカレンダー再編に伴い実施されない見通しであることが判明した。D006 の前提としていた大会が成立しないため、Phase 1 のドッグフード対象を見直す必要がある。

**決定**: MVP ローンチ対象を Six Nations 2027（2027年2〜3月）に変更する。6 チーム総当たり 15 試合で、短期間に十分な試合数を確保でき、日本語の分析コンテンツ需要も引き続き見込める。

**代替案と却下理由**:
- Nations Championship 2026: 構造・放映権が 2026-04 時点で未確定であり、MVP の前提としてリスクが大きい
- Autumn Nations Series 2026: Nations Championship への吸収可能性があり、2026 年の大会形態が未確定
- Japan League One: 「海外リーグ観戦」というプロダクト仮説から外れる

**影響**: `p1-match-ingestion.md` を Six Nations 2027 向けに改訂し、`competitions` シードの slug、対象チーム、試合数を変更する。Phase 1 の検証対象は England / France / Ireland / Scotland / Wales / Italy の 6 代表戦に移る。

**D006 との関係**: D006 は履歴として残すが、本決定で supersede する。以後の Phase 1 仕様書と Codex プロンプトは D007 を優先して参照する。

## D008 — LLM プロバイダを OpenAI に変更（2026-04、D003 を supersede）

**背景**: D003 は Anthropic Claude（Haiku / Sonnet）でパイプラインを組む前提だったが、Owner は OpenAI を採用する方針を選んだ。p0-foundation 実装時点で既に `lib/llm/client.ts` は OpenAI SDK で構築済みであり、`.env` も `OPENAI_API_KEY` を使っている。ドキュメントと仕様書だけが Claude ベースの記述で残っており、整合性が取れていなかった。

**決定**: Tryline の LLM プロバイダは OpenAI とする。モデルは以下の 2 つに集約し、`lib/llm/models.ts` の `MODELS` 定数で一元管理する。

- `MODELS.FAST = "gpt-4o-mini"` — 抽出・Reddit フィルタ・品質チェック等、コスト感度の高い段階
- `MODELS.NARRATIVE = "gpt-4o"` — 日本語ナラティブ生成

**代替案と却下理由**:
- Anthropic Claude（D003 当初案）: Owner が OpenAI を選択済み
- `o1-mini` / `o1` をナラティブに使用: 推論特化でコストが高く、ナラティブ生成には現時点で不要（将来の品質要件次第で再検討）
- `gpt-4.1` 系: 候補だが、2026-04 時点では `gpt-4o` 系が安定・情報量多で当面優位

**影響**:
- 仕様書・ドキュメントから「Claude」「Anthropic」「Haiku」「Sonnet」「ANTHROPIC_API_KEY」の記述を削除し、OpenAI モデル名 / `OPENAI_API_KEY` に置換する（本 PR で一括実施）
- D003 の段階別モデル割り当て（Haiku を 1・2・3・5、Sonnet を 4）は「`FAST` を 1・2・3・5、`NARRATIVE` を 4」として解釈を引き継ぐ
- モデル ID 変更時は `lib/llm/models.ts` の 1 箇所だけを書き換えればよい。仕様書には具体モデル名を直書きしない方針に寄せる（参照は `MODELS.FAST` / `MODELS.NARRATIVE`）
- コスト感は D003 の「プレビューあたり $0.15 以下」目標を引き継ぐが、OpenAI 価格で再計算する必要あり（p1-content-pipeline 着手時に見直し）

**D003 との関係**: D003 は履歴として残すが、本決定で supersede する。以後の Phase 1 仕様書と Codex プロンプトは D008 を優先して参照する。

## D009 — Phase 1 を 4 段階パイプラインに縮退、Reddit は承認後に再追加（2026-04）

**背景**: 2025-11 に Reddit が Responsible Builder Policy を導入し、新規 API アプリは全て事前承認制に移行した。商用利用は別途承認必須で、承認目安は 7 日、却下リスクも存在する。Tryline は ¥980/月 の有料プランを持つため商用扱いとなり、`specs/p1-reddit-ingestion.md`（PR #16 でマージ済み）は承認が下りるまで実装できない。Six Nations 2027 ローンチ（2027-02〜03）のクリティカルパスを Reddit 承認に依存させるリスクが高い。

**決定**: Phase 1 のコンテンツパイプラインは 4 段階構成とする。

1. 集約
2. 事実抽出（`MODELS.FAST`）
3. ナラティブ生成（`MODELS.NARRATIVE`）
4. 品質評価（`MODELS.FAST`）

Reddit フィルタ（元の段階 3）は削除せず「承認後に差し込む拡張点」として温存する。ナラティブ段階の入力に `additionalSignals: AdditionalSignal[]` を定義し、Phase 1 では常に空配列を渡す。Reddit 承認または他ソース採用時は、新段階が同 shape の配列を返すだけでナラティブ側の変更は不要。

**代替案と却下理由**:
- **Reddit 承認待ちで Phase 1 を止める**: 7 日〜未知の遅延を Six Nations 2027 クリティカルパスに載せるのは容認不可
- **別ソース（公式プレス、RugbyPass 等）を Phase 1 に組み込む**: 新規スクレイパーは robots.txt / ToS 確認 / 仕様書作成コストがかかる。縮退でも MVP 品質は成立するため先送り
- **Reddit を恒久的に外す**: コミュニティ・シグナルは将来の差別化要素として価値が高い。恒久除外は失う情報量が大きい

**影響**:
- `specs/p1-content-pipeline.md` を 4 段階に改訂（段階番号繰り上げ、`additionalSignals` 型定義追加）
- `CLAUDE.md` / `AGENTS.md` / `docs/architecture.md` の「5 段階」記述を「Phase 1 は 4 段階」に更新
- `specs/p1-reddit-ingestion.md` / `docs/codex-prompts/p1-reddit-ingestion.md` は削除せず、先頭に「Reddit 承認後に実装、現時点では着手禁止」のバナーを追加。承認取得時にそのまま復活可能
- Owner は並行して Reddit Developer Support に承認申請を提出する（テンプレート: `docs/reddit-approval-request.md`）
- MVP 品質への影響: コミュニティ発の戦術的色味は Phase 1 で提供されない。公式統計 + 過去対戦 + LLM 生成で日本語プレビューは成立するが、「海外ファンの視点」は Phase 2 以降

**Reddit との関係**: `specs/p1-reddit-ingestion.md` を supersede しない（温存）。承認取得時点で本決定を発展的に解消し、段階追加として別 PR で仕様改訂する。

## D010 — `p1-content-pipeline` 未解決事項の一括決着（2026-04-24）

**背景**: `specs/p1-content-pipeline.md` は PR #18（D009 による 4 段階化）時点で 4 つの未解決質問を持ち、Codex への実装依頼を出せない状態だった。未解決のまま放置するとコンテンツパイプライン（Phase 1 のコア機能）が進まず、Six Nations 2027 ローンチ（2027-02）クリティカルパスに直撃する。Claude Code がコスト再試算と各論点の推奨を提示し、Owner が全推奨に同意して決着。

**決定**:

1. **レビュー生成タイミング**: 試合終了後 T+1h で即時実行。公式詳細スタッツの到着を待たない
2. **リトライ戦略**: 段階 3 は temperature の振幅のみ（`0.7 → 0.9 → 0.4`）。モデル昇格は行わない
3. **手動レビューフロー**: Slack 通知 + Supabase Studio 運用。管理 UI は作らない
4. **Reddit 却下時の代替外部シグナル**: Phase 1 では追加しない（`additionalSignals: []` 前提）
5. **`match_content.status` カラム追加**: `draft` / `published` / `rejected` の 3 値
6. **`model_version` 書式**: OpenAI が返す物理バージョン（`gpt-4o-2024-11-20` 等）
7. **`prompt_version` カラム追加**: semver 文字列
8. **コストアラート**: Phase 1 は `pipeline_runs.cost_usd` の DB クエリ監視のみ。Slack 連携は Phase 2（`p1-observability.md`）

**代替案と却下理由**:
- **レビュー遅延公開（T+6h 以降）**: 公式詳細スタッツを待つ案。日本時間で Six Nations の試合終了は早朝のため、通勤時刻までに読める UX 価値のほうが大きいと判断。品質劣化が顕著なら Phase 2 で遅延オプションを追加
- **リトライ時のモデル昇格**: 段階 3 は既に `MODELS.NARRATIVE`（最上位）なので昇格先がない
- **管理 UI を Phase 1 で実装**: 15 試合 × preview/recap = 30 件規模、reject 率 10% でも月数件。実装コストに見合わない
- **Phase 1 での代替外部シグナル（RugbyPass 等）**: 新規スクレイパーは robots.txt / ToS 確認 + 仕様書起票コストが高い。Reddit 承認結果（7 日目安）を待ってから判断

**影響**:
- `specs/p1-content-pipeline.md` を本決定で改訂（同一 PR で実施）
- `docs/architecture.md` の「LLM 利用予算」セクションを OpenAI 試算で上書き
- コンテンツ生成コストは 1 試合あたり ~$0.08（preview + recap 合算、最悪値で ~$0.23）。Six Nations 2027 大会合計で最悪 ~$4
- `match_content` のスキーマ拡張（`status` / `prompt_version`）は Phase 1 の初回マイグレーション（Codex が本仕様書を実装する PR）で適用。既存データがないため後方互換の心配なし
- 後続仕様書として `p1-match-content-display.md`（プレースホルダー差し替え）と `p1-pipeline-scheduling.md`（Vercel Cron）を別途起票予定

**関係する仕様書**: `specs/p1-content-pipeline.md` を本決定の内容で確定。以後、パイプライン関連の判断は D010 を優先参照する。

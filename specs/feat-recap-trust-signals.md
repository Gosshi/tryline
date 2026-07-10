# プレビュー/レビュー記事に根拠が見える表示（信頼シグナル）を追加する

## 背景

2026-07-10、Codex（新モデル）による集客分析で提案された施策。「AI表記を消す」という既出の対応（`project_ai_labeling` メモリ参照）とは別に、**コンテンツの正確性を裏付ける根拠を可視化する**ことで信頼を積み上げる狙い。

現状、`components/match-content-section.tsx`（`PublishedMatchContent` 型は `generatedAt` を持つ）や `components/match-lineups-section.tsx` は個別に表示されているが、記事本文の直下に「この記事はどんな根拠に基づいているか」をまとめて示す表示は無い。既に存在するデータ（`match_lineups` の有無、`match_sourced_facts` の件数、記事の `generated_at`）を組み合わせるだけで実現できる。

## スコープ

対象:
- 試合詳細ページの記事本文（`MatchContentSection`）の直下に、以下を示す小さな「根拠ストリップ」を追加する:
  - ラインアップが確認済みかどうか（`match_lineups` にデータがあるか）
  - 参照した情報源の件数（`match_sourced_facts` の件数、0件なら表示しない）
  - 記事の生成日時（`PublishedMatchContent.generatedAt`）
- 表示は控えめで簡潔なもの（例: 「ラインアップ確認済み・参照元2件・更新: 2026-07-10」の1行程度）とし、記事の可読性を損なわないようにする

対象外:
- `match_sourced_facts` の実際の出典URLをユーザーに公開すること（現状はサーバーサイドの根拠として使うのみで、URL自体を一般公開する設計変更は本specの対象外。件数の表示に留める）
- 大会ガイドページへの同様の表示追加（`fix-competition-guide-factual-errors-and-broadcast-verification.md` で別途対応）

## データモデル変更

なし（既存の `match_lineups`・`match_sourced_facts`・`match_content.generated_at` を使う）。

## API サーフェス

なし。

## UI サーフェス

- `components/match-content-section.tsx` の `afterBody` スロット、または本文直下の新しい表示領域に「根拠ストリップ」を追加する
- ラインアップ0件・sourced_facts 0件の場合は、無理に「未確認」等のネガティブな表示はせず、該当項目を単に非表示にする

## 受け入れ条件

1. ラインアップが確認済みの試合の記事に、「ラインアップ確認済み」等の表示が出る
2. `match_sourced_facts` が1件以上ある試合の記事に、参照元の件数が表示される
3. 記事の生成日時（更新日時）が表示される
4. ラインアップ・sourced_facts が0件の試合では、該当項目が表示されない（不自然な「0件」表示にならない）
5. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る
6. 本番デプロイはOwner承認後に別途行う

## 未解決の質問

- 「根拠ストリップ」の正確な文言・デザインはCodexの実装判断に委ねる

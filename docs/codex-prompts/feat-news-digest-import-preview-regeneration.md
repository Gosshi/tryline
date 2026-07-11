`/specs/feat-news-digest-import-preview-regeneration.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- `scripts/import-news-digest-facts.ts`（PR #543で実装済み）の既存の引数パース・実行フローを確認し、そこに`--regenerate-preview`フラグを追加する形で実装すること
- プレビュー再生成は`lib/llm/pipeline.ts`の`generateMatchContent(matchId, "preview", "ja")`をそのまま呼び出す（内部の4段階パイプライン・QAゲートは変更しない）
- 既存プレビューの有無判定は`lib/db/queries/match-content.ts`の既存クエリ（`getPublishedContentForMatch`等）を再利用すること

入出力の例:
- `pnpm tsx scripts/import-news-digest-facts.ts --file=docs/notes/news-digest-2026-07-10.md --regenerate-preview --dry-run` → 事実がマッチした試合のうち、既存プレビューがあり再生成対象になる試合の一覧（実際には再生成しない）
- `--regenerate-preview`（dry-run無し）→ 対象試合について実際に`generateMatchContent`が呼ばれプレビューが更新される

処理すべきエッジケース:
- 事実がマッチしたが既存プレビューが無い試合（まだ生成窓に入っていない等）は、再生成対象から静かに除外し、エラーにしない
- `--regenerate-preview`を指定しない場合の既存動作（PR #543時点の挙動）に一切の変更・回帰がないこと
- 再生成中にエラーが発生した試合があっても、他の試合の処理を止めない（1件のエラーで全体が失敗しないようにする）

完了の定義:
- specs の受け入れ条件 1〜5 をすべて満たす（受け入れ条件6の本番実行はOwnerが別途行うため対象外）
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean
- `--regenerate-preview`ありなし両方のテストケースを追加する

要件:
- スコープ対象外（自動トリガー化、recap側の再生成、英語版コンテンツの再生成）は実装しない
- 実装方針に迷う場合は完了報告で質問として提示する

完了時:
- 実装内容、変更ファイルを要約する
- `--dry-run`実行結果（再生成対象になる試合の一覧）を報告する
- 仕様書からの逸脱があれば理由を明示する

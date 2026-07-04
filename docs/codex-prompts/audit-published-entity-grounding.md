`/specs/audit-published-entity-grounding.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 前提となる `specs/feat-entity-grounding-gate.md`（PR #467、マージ済み）で追加された `lib/content/allowed-entities.ts`（`buildAllowedPersonEntities`）・`lib/llm/stages/verify-entities.ts`（`verifyNarrativeEntities`）をそのまま再利用する。新しいプロンプトやモデル呼び出しロジックは追加しない
- `assembleMatchContentInput`（`lib/llm/stages/assemble.ts`）は既にexportされている。監査対象の各 `match_id` に対してこれを呼び出し、その戻り値から `buildAllowedPersonEntities` で許可リストを作る
- 本番スクリプトの起動方法・dry-run規約は `scripts/regenerate-overseas-content.ts` を参考にする（`--dry-run` デフォルト、`--confirm-owner-approved` で実行、コスト見積もり表示）
- 本番確認済みの規模: `match_content` の published は preview 71件・recap 828件、合計899件（2026-07-04時点）

入出力の例:
- dry-run実行: `node --env-file=.env.production.local tools/run-ts.cjs tools/audit-entity-grounding.ts` → 対象899件・想定コスト1ドル未満を表示して終了
- 本実行: `node --env-file=.env.production.local tools/run-ts.cjs tools/audit-entity-grounding.ts --confirm-owner-approved` → 全件照合し、違反があった記事のmatch_id・content_type・違反サーフェス・記事URLをレポートファイルに出力
- 絞り込み例: `--content-type preview --limit 10` で最初の10件のプレビューのみ対象にする

処理すべきエッジケース:
- スクリプトは `match_content` に一切書き込みを行わない（SELECT・LLM呼び出しのみ）。unpublishや再生成はしない
- 899件を無制限並行実行しない。同時実行数を制限する簡易な機構を入れる（既存コードに類似の並行実行制御ユーティリティがあれば再利用、無ければシンプルな実装でよい）
- 個別記事の照合呼び出し自体が失敗した場合（APIエラー等）は、その記事を「調査不能」として記録し、監査全体は止めずに続行する（本番生成パイプラインのfail-closedとは別の扱いでよいことをspecに明記済み）
- `assembleMatchContentInput` は監査に不要なフィールドも計算するが、そのまま使ってよい（新しい軽量クエリを書く必要はない）

完了の定義:
- specの受け入れ条件8項目すべてを満たす
- `pnpm test` が通る
- `pnpm tsc --noEmit` でエラーなし
- 実際の本番実行はしない（Owner承認後に別途実行する）

要件:
- 受け入れ条件セクションのすべてを実装する
- 「対象外」にある項目（違反記事の自動unpublish・自動再生成、生成時点データの復元）は実装しない
- 曖昧な箇所があれば末尾に質問として列挙する。推測しない。特にレポート出力形式（JSON/Markdown/CSV）は選んだ形式を明記すること

完了時:
- 実装内容、変更ファイルを要約する
- 仕様書からの逸脱があれば理由を明示する
- 本番実行コマンド（dry-run・実行両方）を明記する。実行はしない
- Owner への未解決の質問があれば記載する

`/specs/fix-projected-lineup-fallback-fabrication.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 根本原因は `lib/llm/stages/assemble.ts` の `loadProjectedLineup()`（355-397行目）: `match_lineups` が0件のとき `players` テーブルをキャップ数(`caps`)降順で取得して返すフォールバックがあり、これが「試合確定lineup」と区別されず `hasLineups=true` として扱われてしまう
- `hasLineups` の消費側は2箇所: `lib/llm/pipeline.ts`（`containsUngroundedPlayerReference` へ渡す）と `lib/llm/prompts/generate-preview.ts`（構成分岐・`lineupUsageBlock`、97-100行目・158-167行目付近）
- 直前の関連修正 `specs/fix-preview-fabricated-player-names.md`（PR #464、マージ済み）で追加した `containsUngroundedPlayerReference`（`lib/content/fabrication-guard.ts`）自体は変更不要。バグは「渡している `hasLineups` の意味が粗い」ことであって、ガードのロジックではない

入出力の例:
- 実際に本番で観測されたケース: 日本 vs イタリア（`match_id = f56e9ee9-14be-49e3-b47d-c51a29c07593`）で `match_lineups` が0件、`players` フォールバックが発動し、`projected_lineups.home` に「Harumichi Tatekawa」「Michael Leitch」等（`is_starter: null` 固定、今日の登録メンバーではない選手も含む）が入った状態で生成すると、本文に「日本のリーダーシップを担うのはキャプテンのハルミチ・タテカワ」という断定的な捏造が生成された
- 変更後: 同じ状況（`match_lineups=0件` かつ `players` フォールバックのみ）では、確定lineup判定が `false` 相当となり、`containsUngroundedPlayerReference` が発火して `factual_grounding=1` に低下、retry/reject に流れる。または `generate-preview.ts` の構成分岐がフォールバックを「ラインアップなし」として扱い、そもそもキープレイヤーセクションが生成されない

処理すべきエッジケース:
- `match_lineups` に実データがある通常の試合では、従来通り `hasLineups=true` として扱われ、PR #464 で追加した既存テストが壊れないこと
- `players` フォールバック自体（配列の中身・キャップ数順ソート）は変更しない。「確定情報として扱うかどうか」の信号だけを追加すること
- 型設計（`AssembledContentInput` への信号追加の具体的な形）は spec の「実装方針」を参考に、既存コードのパターンに矛盾しない範囲で最適化してよい

完了の定義:
- specs の受け入れ条件5項目すべてを満たす
- 本番で実際に観測された失敗ケース（`match_lineups`空 + `players`キャップ数順フォールバック）の再現テストを追加する
- `pnpm test` が通る
- `pnpm tsc --noEmit` でエラーなし

要件:
- 受け入れ条件セクションのすべてを実装する
- 「対象外」にある項目（フォールバック自体の削除、他試合の監査・再生成、`players.position`欠損の修正）は実装しない
- 曖昧な箇所があれば末尾に質問として列挙する。推測しない。特に spec の「未解決の質問」（フォールバック選手名を完全に使わせないか、断定的役割付けだけ禁止するプロンプト指示に留めるか）はどちらを選んだか明記すること

完了時:
- 実装内容、変更ファイルを要約する
- 仕様書からの逸脱があれば理由を明示する
- `PROMPT_VERSION` を何に変更したか明記する
- Owner への未解決の質問があれば記載する

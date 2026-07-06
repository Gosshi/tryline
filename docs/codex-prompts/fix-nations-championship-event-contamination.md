**緊急度: 高**。本番で5試合のrecapが、他国代表選手の得点シーンを実際の対戦国の選手として誤って公開し続けている状態です（事実誤認コンテンツの公開中断ではなく、根本原因のコード修正と正しいデータへの再取り込みが目的）。着手を優先してください。

`/specs/fix-nations-championship-event-contamination.md` の仕様を実装してください。

コンテキスト:

- プロジェクト規約は `CLAUDE.md` を読む
- 過去の判断は `docs/decisions.md` を読む
- 類似の過去インシデント対応パターン: `specs/fix-contaminated-match-events.md`（2026-06-11、原因は異なるが「イベント汚染→クリーンアップ」という対応の型は共通）、`specs/feat-anchorless-event-block-selection.md`（「候補が一意に絞れないなら推測せず null でスキップする」という設計方針を踏襲すること）
- 対象ファイル:
  - `scripts/backfill-nations-championship-match-events.ts`（`buildEventMatchLookup`・`runBackfillNationsChampionshipMatchEvents`）
  - `lib/ingestion/sources/wikipedia-nations-championship-events.ts`
  - `lib/ingestion/sources/wikipedia-six-nations.ts`（`parseWikipediaSixNationsHtml`・`parseVeventBlock`・`processFixtureElement`）
  - `lib/scrapers/wikipedia-match-events.ts`（`parseMatchEventsFromVeventHtml`）
- 参考パターン(決定的な純関数の書き方): `specs/fix-derived-stats-event-integrity-gate.md` の `eventTotalsMatchFinalScore`、`lib/llm/stages/assemble.ts` の `computeScoreTimeline`/`pointsForEvent`（配点定義の重複を避けるため可能なら共有・再利用すること）

入出力の例:

- 現状: `scripts/backfill-nations-championship-match-events.ts` を2026-07-05に実行した結果、Nations Championship 2026 Round 1のfinished6試合（Argentina v Scotland, Australia v Ireland, Fiji v Wales, South Africa v England, New Zealand v France, Japan v Italy）すべてに、**完全に同一の18イベント**（home合計34点/away合計32点、得点者名はJordan/Roigard/Love/Lakai=NZ選手、Penaud/Lucu/Jalibert/Hastoy/Attissogbe=フランス選手固定）が挿入された。この値は実在の「New Zealand 34-32 France」戦のスコアそのもので、他5試合の実スコア（例: Argentina 38-47 Scotland）とは一致しない。
- 変更後: 修正版スクリプトを `--reparse-existing` で再実行すると、6試合それぞれに対して**その試合固有の**Wikipediaブロックからパースしたイベントが挿入され、イベント合計が各試合の実スコアと一致する。一意に対応するブロックが見つからない試合は（推測せず）スキップされ、ログに理由が出力される。
- 対照ケース: 挿入前ガードにより、パース結果のイベント合計が最終スコアと不一致な場合は `upsertMatchEvents` が呼ばれずスキップされる（DBに汚染データが二度と書き込まれない）。

処理すべきエッジケース:

- 一意なブロックが見つからない試合（0件 or 複数候補で日付等でも絞れない）は `null` 扱いでスキップし、既存イベントを消さない・誤ったデータで上書きしない
- New Zealand v France は正しいデータが既に入っているため、`--reparse-existing` 再実行後も同じ内容（またはより正確な内容）で収束すること。誤って空にならないこと
- ペナルティトライ（7点）など `try` 以外の特殊配点がある場合、配点定義の重複実装を避け既存ロジックと整合させる
- 挿入前ガードで弾かれたケースは `skipped` カウントに含め、ログで「event totals mismatch」であることが分かるようにする（原因不明の unresolved スキップと区別する）

完了の定義:

- specの受け入れ条件6項目すべてを満たす
- `pnpm test`・`pnpm tsc --noEmit` 通過
- 修正後、対象6試合について `--dry-run` の出力を貼り付け、各試合のイベント合計と実スコアが一致する（または一致しないため意図的にスキップされた）ことを示す
- 汚染原因（上記「調査手順」の(a)/(b)/(c)のどれだったか、または別の原因だったか）を実装報告に明記する

要件:

- 受け入れ条件セクションのすべてを実装する
- 「スコープ対象外」にある項目（`lib/llm/pipeline.ts` の生成時チェックの全面ブロッキング化、recap本文の手修正、New Zealand v France への変更）は実装しない
- 汚染済み5試合の実データへの再取り込み（クリーンアップの実行）は、コード修正・テスト完了後にOwner承認を得てから別途実行する運用（スクリプト自体は用意するが、Codexが本番に対して勝手に実行しない）
- 曖昧な箇所があれば末尾に質問として列挙する。推測しない

完了時:

- 実装内容、変更ファイルを要約する
- 汚染の根本原因が何だったかを明記する（調査手順で切り分けた a/b/c のどれか、または新たに判明した原因）
- 仕様書からの逸脱があれば理由を明示する
- Owner への未解決の質問があれば記載する（特に仕様書の「未解決の質問」3点: score-integrityチェックの全面ブロッキング化の要否、汚染済み5試合recapのdraft降格要否、他スクリプトへの横展開要否）

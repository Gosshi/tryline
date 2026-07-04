`/specs/fix-preview-fabricated-player-names.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 既存の決定的ガードのパターンは `lib/content/fabrication-guard.ts` の `containsUnsupportedStatistic` を参考にする。新ガードもこれと同じ「LLM judge ではなくコードで決定的に検出する」思想に揃えること
- ガードの呼び出し元は `lib/llm/stages/qa.ts` の `applyDeterministicQaGuards`（`containsUnsupportedStatistic` の呼び出し箇所、108〜134行目付近）。`hasEvents` が既に同様のパターンで呼び出し元から渡されているので、`hasLineups` も同じ経路で配線すること
- `qa.ts` を呼び出している上流ステージ（`lib/llm/stages/generate-narrative.ts` 等）で `hasLineups`（または projected_lineups の有無）を既に持っているはずなので、そこから配線する
- 過去の類似修正 `specs/fix-sourced-facts-zero-fabrication.md`（実装コミット: PR #404）も参考にする。今回はプロンプトのテキスト指示ではなく、それをすり抜けた実例に対するコードレベルのガード追加

入出力の例:
- 実際に本番で観測された捏造テキスト（再現用）: `match_lineups` が0件の試合で生成されたプレビューに「セクション2: キープレイヤーとマッチアップ」という見出しがあり、「山澤拓也（フライハーフ）」「中野将伍（センター）」「藤原信（スクラムハーフ）」という、当該試合の登録メンバーに実在しない選手名が含まれていた
- 変更後: 同条件（`hasLineups = false`, `hasEvents = false`）でこのようなテキストが生成された場合、`containsUngroundedPlayerReference` 等の新ガードが検出し `factual_grounding` を1に低下、`issues` に追加、`retry`（2回目以降 `reject`）に流れる

処理すべきエッジケース:
- `hasLineups = true` または `hasEvents = true` の場合は誤検知しないこと（実データがある試合では選手名言及は正当な仕様）
- 正規表現の精度は spec 記載のサンプルを起点に Codex が既存テスト（`tests/content/fabrication-guard.test.ts` 等）を見ながら調整すること。過検知（正当な戦術描写がブロックされる）を避けること
- spec の「実装方針」に例示したコードはあくまで叩き台。関数名・正規表現・実装場所は既存コードのパターンと矛盾しない範囲で Codex が最適化してよい

完了の定義:
- specs の受け入れ条件5項目すべてを満たす
- 本番で実際に観測された捏造テキストの再現データに対する回帰テストを追加する
- `pnpm test` が通る
- `pnpm tsc --noEmit` でエラーなし

要件:
- 受け入れ条件セクションのすべてを実装する
- 「対象外」にある項目（NER実装、既存 published content の再生成等）は実装しない
- 曖昧な箇所があれば末尾に質問として列挙する。推測しない

完了時:
- 実装内容、変更ファイルを要約する
- 仕様書からの逸脱があれば理由を明示する
- Owner への未解決の質問があれば記載する（特に「正規表現ベースで十分な精度が出たか」は必ず報告すること）

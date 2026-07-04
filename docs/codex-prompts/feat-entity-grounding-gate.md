`/specs/feat-entity-grounding-gate.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 背景となる設計文書 `/docs/design-content-grounding-architecture-2026-07-04.md` を必ず読むこと。この設計に至った経緯（今日1日で発生した4回の選手名捏造インシデントと、都度対応の限界）が詳しく書かれている
- 既存の決定的ガードのパターンは `lib/content/fabrication-guard.ts` の `containsUnsupportedStatistic` / `containsUngroundedPlayerReference` を参考にする。ただし今回は**LLM呼び出しを伴う新しいステージ**であり、既存の同期関数ガードとは構造が異なる。既存QA呼び出しのパターンは `lib/llm/stages/qa.ts` の `evaluateNarrativeQuality`（`createTextResponse` の呼び方・`jsonMode`・リトライ制御）を参考にする
- `lib/llm/lineups.ts` の `hasConfirmedEntry`（現状非export）を export し、`allowed-entities.ts` から再利用すること
- `MODELS.FAST`（`gpt-4o-mini`）は `lib/llm/models.ts` で定義済み

入出力の例:
- spec に埋め込んだフィクスチャA・B・Cはすべて実際に本番で生成された捏造テキストの全文（改変・要約なし）。これらをテストファイルにそのまま書き起こし、`allowedEntities: []`（当時の実データ状態=lineup/events/sourced_facts全て空を再現）で検証すること
- 正常系の例: `allowedEntities` に「ワーナー・ディアンズ」等の確定ラインアップ選手が含まれる場合、本文でその選手に言及しても違反にならないこと。カタカナ表記ゆれ（例: 本文「ガルビジ」⇔許可リスト「Alessandro Garbisi」）も同一人物として対応付けられることを確認するテストを追加すること

処理すべきエッジケース:
- 許可リストが空（データスパース試合）の場合、いかなる人名も定義上違反になること
- 照合ステージ自体がAPIエラーで失敗した場合、fail-closed（publishしない）であること。silent fallbackで素通しにしないこと
- 初回生成経路とlength-revision retry経路の**両方**に照合を適用すること。どちらか一方だけ塞いで他方が抜け穴になる、というのが今日3回実際に起きたパターンなので特に注意すること
- 照合対象はチーム名を含めず人名のみ（誤検知を避けるため。spec記載の通り）

完了の定義:
- specの受け入れ条件8項目すべてを満たす
- フィクスチャA・B・Cそれぞれで `UNGROUNDED_ENTITY_ISSUE` が検出されることを回帰テストで確認する
- `pnpm test` が通る
- `pnpm tsc --noEmit` でエラーなし
- preview・recap 両方のパイプラインに適用されていることを確認する

要件:
- 受け入れ条件セクションのすべてを実装する
- 「対象外」にある項目（人名以外への拡張、公開済みコンテンツの監査、該当試合の再生成実行、案A/constrained decoding等の不採用手法）は実装しない
- 曖昧な箇所があれば末尾に質問として列挙する。推測しない。特に spec の「未解決の質問」（retryフィードバック注入の統合方法、並行実行が難しい場合の直列実行許容）はどちらを選んだか明記すること

完了時:
- 実装内容、変更ファイルを要約する
- 仕様書からの逸脱があれば理由を明示する
- コスト試算（実際のトークン数ベースで再計算した場合の数値）を報告する
- Owner への未解決の質問があれば記載する

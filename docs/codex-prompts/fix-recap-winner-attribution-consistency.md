`/specs/fix-recap-winner-attribution-consistency.md` の仕様を実装してください。

コンテキスト:

- プロジェクト規約は `CLAUDE.md` を読む
- 設計原則の背景は `docs/design-content-grounding-architecture-2026-07-04.md`(「LLM は分類器、判定はプログラム」の原則。人名捏造ゲート PR #467 と同型の解決をスコア×勝敗記述の整合性チェックに適用する)
- 対象ファイル:
  - `lib/llm/prompts/qa-content.ts`(`winnerCheckBlock`, 50-61行目付近、`PROMPT_VERSION`)
  - `lib/llm/stages/qa.ts`(`ParsedQaResponse`型、`applyDeterministicQaGuards`関数、`isFactualGroundingHardBlock`関数)
  - `lib/content/fabrication-guard.ts`(issue定数、1-6行目付近に既存3定数と並置)
- 参考パターン: `lib/llm/stages/qa.ts` 内の既存デターミニスティックガード(`containsUnsupportedStatistic`・`containsUngroundedPlayerReference`の呼び出し部分、113-206行目の`applyDeterministicQaGuards`)。今回追加するガードも同じ関数内に同じスタイルで足す
- 参考パターン(スコア一致判定の純関数の書き方): `specs/fix-derived-stats-event-integrity-gate.md` に実装済みの `eventTotalsMatchFinalScore`(同種の「null/不一致ならfalse」という決定的な純関数)

入出力の例:

- 現状: recapのQA応答が `{"scores": {...}, "issues": []}` を返し、本文の結論部分が実際の敗者チームを勝者として記述していても、コード側は何もチェックせず素通しする(2026-07-04発生の実インシデント: match_id `42bebc1f-9225-452b-9786-9e0a1fbaa34a`、DBスコア Argentina(home) 38 - Scotland(away) 47 で Scotland が勝者にもかかわらず、本文結論部が「アルゼンチンが...47対38で試合を制した」と記述して公開された)
- 変更後: QA応答スキーマに `statedWinner: "home" | "away" | "unclear"` を追加。上記ケースでQAモデルが `statedWinner: "home"` と分類した場合、`computeActualWinner(38, 47)` が `"away"` を返すため両者が食い違い、`issues` に `WINNER_MISMATCH_ISSUE` が追加され `factual_grounding` が1に落ちる
- 対照ケース: `statedWinner` が実際の勝者と一致する場合、または `"unclear"` の場合は何も変更しない

処理すべきエッジケース:

- 同点(`computeActualWinner` が `"draw"`)、またはスコアいずれかが `null`(`computeActualWinner` が `null`)の場合は、`statedWinner` の値に関わらずガードは何もしないこと(仕様書の受け入れ条件5)
- `statedWinner` が `"unclear"` の場合はペナルティを課さないこと。false positive回避のため、QAモデルが自信を持てないケースまで機械的に落とさない設計(仕様書の受け入れ条件4)
- `contentType !== "recap"` の場合はこのガードを適用しないこと(previewは対象外)
- このガードは既存の他ガード(`entityViolations`・`unsupportedStatistic`・`ungroundedPlayerReference`・字数)と衝突せず併存させること。`issues`配列への追加は既存の`appendIssue`ヘルパーを使う

完了の定義:

- specの受け入れ条件8項目すべてを満たす
- `pnpm test`・`pnpm tsc --noEmit` 通過
- `lib/llm/prompts/qa-content.ts` の `PROMPT_VERSION`(現行 `qa@2.2.0`)をバンプすること
- 今回の実インシデント本文(match_id `42bebc1f-9225-452b-9786-9e0a1fbaa34a`)をフィクスチャ化した回帰テストを含める。本文取得は本番DB(Supabase `tryline` プロジェクト、`match_content`テーブル、`match_id`カラムで絞り込み、`content_type='recap'`)から読み取り専用で参照してよい

要件:

- 受け入れ条件セクションのすべてを実装する
- 「スコープ対象外」にある項目(新規LLM呼び出しの追加、遡及監査バッチの新設、該当recapの再生成)は実装しない
- 曖昧な箇所があれば末尾に質問として列挙する。推測しない

完了時:

- 実装内容、変更ファイルを要約する
- 仕様書からの逸脱があれば理由を明示する
- `PROMPT_VERSION` を何に変更したか明記する
- Owner への未解決の質問があれば記載する(特に仕様書の「未解決の質問」2点: 遡及監査の要否、`statedWinner`分類の実データでの精度検証)

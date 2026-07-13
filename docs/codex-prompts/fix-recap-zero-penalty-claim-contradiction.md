`/specs/fix-recap-zero-penalty-claim-contradiction.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 対象は `lib/content/fabrication-guard.ts`（新規関数追加）、`lib/llm/stages/qa.ts` の `applyDeterministicQaGuards()`（`containsUnsupportedStatistic()`の呼び出し箇所、現在L427付近）・`isFactualGroundingHardBlock()`（L75-84）、`lib/llm/prompts/generate-recap.ts` の `teamStatsBlock`（`fix-recap-team-stats-underutilization.md`で追加した2文の直後）
- 実際に本番の試し焼きで2回連続発生した事例: 「アイルランドは反則を犯さず、規律あるプレーで日本の攻撃を封じ込めた」という記述が、実際は両チームとも反則9回（`team_stats.penalties_conceded`）であるにもかかわらずQAを通過しpublishされた。既存の`containsUnsupportedStatistic`は「反則というトピックに根拠があるか」しか見ておらず、「ゼロという断定が実数と矛盾していないか」を検証していない
- 重要: `Top14TeamStats`のデータ構造自体は既に「確認済みの0」と「未取得（キー不在）」を区別できている（`deriveTeamStatsFromSourcedFacts()`はfactがあれば0を含む実値を格納し、無ければキーを設定しない）。型変更は不要で、本specはこの既存の区別を(a)QAの決定的ガード、(b)生成プロンプトの指示、双方で正しく活用することが目的
- 反則専用ではなく、**ターンオーバー・タックルミス・エラー・イエローカード・レッドカードを含むカウント系スタッツ全般**を対象にした汎用チェックにする（ラグビーの試合スタッツ語彙は既知・有限のため、個別パターンを都度追加するのではなく汎用テーブルで対応する）

入出力の例:
- `containsContradictedZeroStatClaim("アイルランドは反則を犯さず、規律あるプレーで日本を封じ込めた", { home: { penalties_conceded: 9 }, away: { penalties_conceded: 9 } })` は `true`
- `containsContradictedZeroStatClaim("日本はターンオーバーなしで試合を進めた", { home: { turnovers: 5 }, away: { turnovers: 3 } })` は `true`（反則以外のカウント系スタッツでも同様に検出できること）
- `containsContradictedZeroStatClaim("日本は反則が多かった", {...})` は `false`（「ゼロ」断定パターン自体に一致しないため対象外。この表現は既存`containsUnsupportedStatistic`が別途担当する）
- `team_stats`が`null`の場合は`false`

処理すべきエッジケース:
- home/awayどちらのチームについての「ゼロ」断定かを本文から厳密に特定するのは困難なため、spec記載の通り**home/awayいずれかの実際の値が1以上であれば矛盾とみなす**（安全側に倒す設計。厳密な主語特定は本specのスコープ外）
- 実際に該当スタッツが0-0の試合であれば矛盾なし（`false`）として扱うこと
- スタッツ名→フィールド名のマッピングテーブル（`ZERO_CLAIM_STAT_FIELDS`）は`lib/llm/sourced-facts/derive-team-stats.ts`の`STAT_FIELD_BY_NAME`と語彙の一貫性を確認すること（同じ日本語ラベルを使う）
- ポゼッション率・テリトリー率・ラインアウト成功率・スクラム成功率等の**パーセンテージ系フィールドは対象外**（スコープ対象外セクション参照）
- 生成プロンプト側の追加指示文が、既存の`teamStatsBlock`の2文（最低3種類引用の要求、因果関係の要求）と矛盾しないこと（「言及しない」という制約と「積極的に使うこと」という推奨が両立するよう、キーが存在する項目については引き続き積極的に使ってよい旨が伝わる書き方にする）

完了の定義:
- specの受け入れ条件1〜5のうち、1〜4（コード実装・テスト・ビルド）を満たす
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean

要件:
- テストは `tests/content/fabrication-guard.test.ts`（新規関数の単体テスト、反則以外のカウント系スタッツでのケースも含む）、`tests/llm/stages/qa.test.ts`（`describe("isFactualGroundingHardBlock", ...)` L295-305の近く、または`describe("evaluateNarrativeQuality", ...)` L307以降の既存パターンに倣った統合テスト）、`tests/llm/prompts/generate-recap.test.ts`（teamStatsBlockの新規文言確認）に書く
- 「スコープ対象外」（`containsUnsupportedStatistic()`の既存ロジック変更、パーセンテージ系フィールドへの拡張、ゼロ以外の相対的断定表現の矛盾検出、`Top14TeamStats`型自体の変更）は実装しない
- 受け入れ条件5（試し焼き再生成での確認）はOwner/Claude Codeが本番LLMコストを伴って別途実施するため、Codexのスコープには含めない
- 曖昧な箇所があれば末尾に質問として列挙する。推測しない

完了時:
- 実装内容、変更ファイルを要約する
- 仕様書からの逸脱があれば理由を明示する
- Owner への未解決の質問があれば記載する

`/specs/fix-home-recent-reviews-round-grouping.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 対象は `lib/db/queries/matches.ts` の `getRecentlyReviewedMatches`（599-624行目）と、その唯一の呼び出し元 `app/page.tsx:103`
- 既存の類似ロジック（参考にすること）: `mapRoundHubRowsToParams`（`lib/db/queries/matches.ts:1152-1189`、`competition.family + season + round` でグルーピングする前例）、`getRoundFromExternalIds`（同ファイル417行目、`external_ids` からラウンド番号を抽出する既存ヘルパー）
- `RECENTLY_REVIEWED_MATCH_SELECT`（同ファイル310行目付近）の `competition` ネストされた select に `family` フィールドが無いので追加が必要（現状 `slug, name, name_ja, season` のみ）

入出力の例:
- 変更前: `generated_at` 降順で単純に上位3件を返す。同じ節の試合でも生成順で漏れる試合が出る
- 変更後: 最も新しく生成されたレビューが属する「大会(family)+シーズン+ラウンド」を特定し、そのラウンドに属する全ての公開済みレビューを返す（`generated_at` 降順のまま）。ラウンドが変われば自動的に対象も変わる

処理すべきエッジケース:
- `getRoundFromExternalIds` が直近レビューの試合で `null` を返す場合（ラウンド情報なし）は、フォールバックとしてその1件のみ返す
- 候補プール（`generated_at` 降順で一定件数取得、目安20件）が1節の試合数より少ない場合に取りこぼしがないか確認する。取りこぼす可能性があるなら候補プール件数を増やすか、Codexの判断で適切な値にする
- フィルタ後の件数が多すぎる場合の安全策として上限8件程度でキャップする
- `app/page.tsx:103` の呼び出しを新しいシグネチャ（`limit` パラメータ削除）に更新する。UI側（`app/page.tsx:450-503`のヒーロー/コンパクト行ロジック）は可変長配列にそのまま対応できるため変更不要なはずだが、念のため動作確認する

完了の定義:
- specs の受け入れ条件7項目すべてを満たす
- `pnpm test` で既存テストが通る（関数シグネチャ変更に伴うテスト更新を含む）
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean
- 本番相当のデータ（同一節に6試合、うち1件が節内最速キックオフ）を模したテストケースを追加し、全件が返ることを確認する

要件:
- 「対象外」にある項目（`getRecentlyReviewedMatchesForFamily`、UI表示ロジックの変更、大会をまたいだグルーピング）は実装しない
- 曖昧な箇所（ラウンド情報なしのフォールバック、候補プール件数）があれば末尾に質問として列挙してよいが、spec記載の仮基準で進めても構わない

完了時:
- 実装内容、変更ファイルを要約する
- 候補プール件数・上限キャップの値を最終的にいくつにしたか明記する
- 仕様書からの逸脱があれば理由を明示する
- Owner への未解決の質問があれば記載する

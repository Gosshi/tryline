`/specs/fix-lipovitan-challenge-cup-scraper-rugbybox-parsing.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- 2026-07-21、Ownerが本番向けに`pnpm tsx scripts/import-lipovitan-challenge-cup-results.ts 2026`を実行したところ`Error: Expected 4 Lipovitan Challenge Cup matches, got 2.`で失敗した（DB書き込み前のチェックで止まったため実害なし）
- 原因は`lib/scrapers/wikipedia-lipovitan-challenge-cup-results.ts`の`parseJapaneseFixtureRows()`が実際のWikipediaページの構造（`rugbybox`テンプレートの`data-mw` JSON埋め込み）と合っていなかったため。単体テストは手作りの単純な`<table><tr><td>`フィクスチャで通っていたが、実ページに対しては機能しない

やること:
- `parseJapaneseFixtureRows()`（および呼び出し元の`parseLipovitanChallengeCupResultsHtml()`）を、`data-mw`属性のJSON（`rugbybox`テンプレートの`params.date` / `params.time` / `params.home` / `params.away` / `params.score` / `params.stadium`）を読む実装に書き換える。`lib/scrapers/wikipedia-league-one-playoffs.ts`の`collectRugbyboxTemplates()`と同等のヘルパーを再利用・踏襲する
- `home`は`{{ru-rt|XXX}}`形式、`away`は`{{RU|XXX}}`形式で3文字国コードが入っている。`JPN→japan`・`AUS→australia`・`CAN→canada`・`FIJ→fiji`にマッピングする
- `tests/scrapers/wikipedia-lipovitan-challenge-cup-results.test.ts`のテストフィクスチャを、実際のページ構造（spec記載の`data-mw` JSON形式）に基づいたものに書き換える

処理すべきエッジケース:
- `date`（例: `2026年8月8日(土)`）と`time`（例: `19:05 [[日本標準時|JST]] ([[UTC+9]])`）は別々のtemplateパラメータなので、`<br/>`で連結されたレンダリング後テキストに依存せず、パラメータ単位で個別にパースする
- `score`パラメータが空でない場合（JAPAN XV戦は`"31-38&lt;br />&lt;small>24-前半-7&lt;/small>"`のような複雑な文字列）、先頭の`\d+-\d+`のみを抽出する
- JAPAN XV戦・マオリ・オールブラックス戦は引き続き対象外（`JPN`/`AUS`/`CAN`/`FIJ`以外の組み合わせとして自然に除外される実装にする）

完了の定義:
- specの受け入れ条件1〜7を満たす
- `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean
- 可能であれば実際にWikipediaページをfetchして`pnpm tsx scripts/import-lipovitan-challenge-cup-results.ts 2026`を`--dry-run`相当の確認（実際のDB書き込みは行わない形）で試し、4件返ることを確認する。fetchできない環境の場合はテストフィクスチャでの検証で代替してよい

要件:
- `parseAustraliaJapanTestSeriesResultsHtml()`・`parseJapanFijiOfficialResultsHtml()`・`scripts/import-lipovitan-challenge-cup-results.ts`は変更しない（原因箇所ではない）
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する

完了時:
- 実装内容・変更ファイルを要約する
- 修正後に実際のページ構造（またはそれを模したフィクスチャ）で4試合中3試合が正しくパースされることを確認した結果を報告する
- 仕様書からの逸脱があれば理由を明示する
- 未解決の質問があれば記載する

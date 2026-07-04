`/specs/fix-wikipedia-vevent-section-traversal.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 対象は `lib/ingestion/sources/wikipedia-six-nations.ts` の `parseWikipediaSixNationsHtml`（201行目付近）と `lib/ingestion/sources/wikipedia-pnc.ts` の `collectSectionVevents`（58行目付近）
- 実際に本番相当のURLを fetch して構造を確認すること: `https://en.wikipedia.org/wiki/2026_Nations_Championship_Southern_Hemisphere_Series`（Parsoid形式、`<section data-mw-section-id aria-labelledby="Round_1">` が h3見出し+vevent群をラップしている）
- 既存の後方互換対象: 現在の単体テストフィクスチャ（div.mw-heading が兄弟として並ぶclassic形式）

入出力の例:
- 実際に確認した構造（spec背景に記載）: `<section data-mw-section-id="5" aria-labelledby="Round_1"><div class="mw-heading mw-heading3"><h3 id="Round_1">Round 1</h3></div><div class="vevent summary" id="New_Zealand_v_France">...</div>...</section>`
- 変更前: このsection構造の中身は `.next()`ベースの兄弟走査で完全に無視される（`eventMatches: 0`という本番実測を確認済み）
- 変更後: section要素でラップされていても中の見出し・vevent情報を正しく抽出できる

処理すべきエッジケース:
- classic形式（div.mw-heading が同階層の兄弟として並ぶ既存フィクスチャ）でも引き続き動作すること（後方互換、既存テストが壊れないこと）
- `wikipedia-pnc.ts`のPool_A/Pool_B・Finals系セクションでも同様に修正すること
- ラウンド番号の判定ロジック（`parseRoundFromId`等）との整合性を保つこと
- `wikipedia-six-nations.ts` 226行目付近の既存フォールバック（`#Fixtures` が無いページでは全 `div.vevent.summary` をページ全体から収集）を退行させないこと
- `2026_Six_Nations_Championship` の現行ページも Parsoid 形式（section 25個・vevent 15個、Owner確認済み）。追加フィクスチャ候補として有用

完了の定義:
- specの受け入れ条件1-4、6を満たす（受け入れ条件5の本番dry-run確認はOwnerが実施）
- `pnpm test`・`pnpm tsc --noEmit` 通過

要件:
- 受け入れ条件セクションのすべてを実装する
- 「対象外」にある項目（各ソース固有のロジック変更、過去インポートスクリプトの再実行、他大会の稼働監査）は実装しない
- 曖昧な箇所（specの「未解決の質問」）は実装時に判断し、結果を報告すること

完了時:
- 実装内容、変更ファイルを要約する
- 採用した走査アルゴリズムの設計方針を報告する
- 仕様書からの逸脱があれば理由を明示する
- Owner への未解決の質問があれば記載する（Autumn Nations 2026 / Rugby Championship 2026 は本番DBに試合0件のため現時点の実害なしと確認済み。稼働状況調査は不要）

`/specs/fix-competition-season-page-flow.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- `app/c/[competition]/[season]/page.tsx` 全体（`SeasonSwitcher`・`SeasonMatchGroups`・`StandingsTable`・`CompetitionViewingGuide` の呼び出し箇所）を読んで現状の実装を理解すること
- 「日本代表の次戦」は、該当シーズンのチーム一覧に `japan` slugが含まれるかで判定できる。既存の `listMatchesForCompetition` 等のクエリ関数を再利用すること

入出力の例:
- Nations Championship 2026のシーズンページ → ヘッダー直下に「次戦: 7/11 日本 vs アイルランド」「首位: 南アフリカ」の要約帯、初期表示は日程・結果タブ
- Premiershipのシーズンページ（日本代表出場なし） → 「日本代表の次戦」は非表示、他の要約情報のみ表示

処理すべきエッジケース:
- シーズンがまだ開幕前・全試合終了後の場合の「次戦」表示（無ければ非表示にする）
- プレーオフのみの大会（Top14・Premiership・URC）で順位表が存在しない場合の要約帯・タブ構成

完了の定義:
- specs の受け入れ条件 1〜5 をすべて満たす（受け入れ条件6の本番デプロイはOwnerが別途行うため対象外）
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean

要件:
- スコープ対象外（各コンポーネントのデータ取得ロジック変更）は実装しない
- 実装方針に迷う場合は完了報告で質問として提示する

完了時:
- 実装内容、変更・新規ファイルを要約する
- タブ切り替えをSSR/SEOの観点でどう実装したか説明する
- 仕様書からの逸脱があれば理由を明示する

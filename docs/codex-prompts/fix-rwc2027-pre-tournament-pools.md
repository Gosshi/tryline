`/specs/fix-rwc2027-pre-tournament-pools.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 対象ファイルは `app/c/rwc/2027/page.tsx` のみ
- 関連する過去の spec `specs/fix-rwc2027-hub-page-gate.md`（本番反映済み、`tournamentStarted` の判定ロジックを導入）を先に読み、既存の分岐構造を理解すること

入出力の例:
- 変更前（開幕前）: ページ上部に POOL A〜F の6つの `StandingsTable`（全て 0 試合 0 勝 0 敗）が並び、その下に日程が続く
- 変更後（開幕前）: 日程（`SeasonMatchGroups`）が先に表示され、その下に `PoolTeamGrid`（チーム名のみのコンパクトなグリッド）が続く
- 変更後（開幕後、`tournamentStarted === true`）: 従来通り実統計入りの `StandingsTable` が日程より上に表示される（この分岐は変更しない）

処理すべきエッジケース:
- `pool.standings` の中に `teamName === "-"`（予選プレーオフ勝者等、未確定枠）が含まれる場合、「未確定」という文言で表示すること。生の `-` をそのまま出さない
- `tournamentStarted` の真偽で表示する内容が完全に切り替わることを確認すること（開幕前後で異なるコンポーネントツリーになる）
- `matches.length === 0` の場合の `PendingState`（早期 return）は一切変更しないこと

完了の定義:
- `app/c/rwc/2027/page.tsx` に spec の「表示順序の変更」通りの分岐が実装されている
- `PoolTeamGrid` が実装され、`teamName === "-"` のケースが「未確定」と表示される
- `<h1>` が「ラグビーワールドカップ2027」に変更されている
- 開幕前・開幕後それぞれの表示をスクリーンショットで確認する（開幕後のケースは実データが無ければ `tournamentStarted` を一時的に `true` に固定してローカルで確認してもよい。確認後は元に戻すこと）
- `pnpm tsc --noEmit` / `pnpm build` が通る

要件:
- 受け入れ条件セクションのすべてを実装する
- 「スコープ対象外」（bracket ページ、`getPoolStandingsForCompetition`、`StandingsTable` 本体、国旗アイコン）は実装しない
- 曖昧な箇所があれば末尾に質問として列挙する。推測しない

完了時:
- 実装内容、変更ファイルを要約する
- 仕様書からの逸脱があれば理由を明示する
- Owner への未解決の質問があれば記載する

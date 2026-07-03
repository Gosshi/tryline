`/specs/feat-season-page-ia.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 対象ファイルは `app/c/[competition]/[season]/page.tsx`（表示順序変更）と `components/standings-table.tsx`（フルネーム表示）の2つ
- spec 内の「事前確認: 誤検出の訂正」を必ず読むこと。`components/season-match-groups.tsx` のアコーディオン展開ロジックは**既に正しく動作している**ため一切変更しないこと

入出力の例:
- 変更前: ページ上部から「大会ガイド（長文）→試合一覧→順位表」の順で表示される
- 変更後: 「順位表→試合一覧→大会ガイド（折りたたみ済み `<details>`）」の順で表示される
- 変更前: 順位表のチーム名が PC 幅でも "NOR" のような略号のみ
- 変更後: PC/タブレット幅（sm 以上）では "ノーザンプトン・セインツ" のようなフルネームが表示され、モバイル幅では従来通り略号+ホバー title

処理すべきエッジケース:
- `matches.length === 0`（空状態）のケースで `StandingsTable` の表示位置がどうなるか確認すること（spec の「変更後」構造どおり、空状態でも standings があれば表示、無ければ `StandingsTable` 内部のガードで自動非表示になる）
- `id="standings"` を `StandingsTable` の位置移動と一緒に移すこと。他に `#standings` を参照している箇所が無いことは spec 作成時点で確認済みだが、念のため実装前に再度 `grep -rn "#standings" app components` で確認すること
- `<details>` 内の `CompetitionViewingGuide` の見出し重複（`<summary>` と内部の `<h2>大会ガイド</h2>`）を実装時に見た目で調整すること

完了の定義:
- `app/c/[competition]/[season]/page.tsx` の JSX 順序が spec 通りになっている
- `components/standings-table.tsx` がフルネームを sm 以上で表示する
- `components/season-match-groups.tsx` に差分が無い（`git diff --stat` で確認）
- 実際のシーズンページ（試合データがあるもの）で表示順序をスクリーンショット確認する
- `pnpm tsc --noEmit` / `pnpm build` が通る

要件:
- 受け入れ条件セクションのすべてを実装する
- 「スコープ対象外」にある `season-match-groups.tsx` のロジック、ハブページ（`app/c/[competition]/page.tsx`）、プレーオフ圏の色分け精緻化は実装しない
- 曖昧な箇所があれば末尾に質問として列挙する。推測しない

完了時:
- 実装内容、変更ファイルを要約する
- 仕様書からの逸脱があれば理由を明示する
- Owner への未解決の質問があれば記載する

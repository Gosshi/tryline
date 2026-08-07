`specs/feat-greatest-rivalry-tour-2026.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- 過去の判断は `docs/decisions.md` を読む
- **パーサの動作は検証済み**: Wikipedia の `2026_New_Zealand_rugby_union_tour_of_South_Africa` に対して既存パーサを実行し、全8試合を正しく抽出できることを確認済みです。構造調査から始める必要はありません。spec の背景にある表が実測結果です
- 参考にする既存パターン（**これをほぼそのまま複製する作業です**）:
  - `lib/ingestion/sources/wikipedia-rugby-championship.ts`（47行）— チーム名対応表・URL 生成・`parseWikipediaSixNationsHtml` の呼び出し・`toEmptyWhenMissingOrUnstructured`・`mapWithTeamSlugs`・`fetchWithPolicy`・`isMissingWikipediaPage` の使い方がすべて揃っています
  - `lib/ingestion/live-competitions.ts:43-50`（rugby-championship のエントリ）— 登録の形
- チームは6つとも `teams` に登録済みです。**新規チーム登録は不要**。`sharks`（南アフリカ）は Premiership の `sale-sharks` とは別レコードとして既に存在します

実装のポイント:
- Wikipedia URL は年度から組み立てられない特殊な形式です。他大会のような `${season}_...` のテンプレート化はせず、固定 URL を返す関数にしてください
- ツアーには順位表がありません。既存の大会ハブテンプレートが空の順位表をどう描画するか実際に開いて確認し、不自然なら非表示にしてください

エッジケース:
- **第4テスト（9/12）だけタイムゾーンが違います**（米国ボルチモア、EDT = UTC-04）。他7試合は SAST = UTC+2 です。`kickoff_at` を UTC で保存する際にここを取り違えないこと。テストで両方のタイムゾーンを固定してください
- 同一カード（South Africa vs New Zealand）が4回登場します。日付とセクション ID で別試合として区別されることを確認してください
- Wikipedia のセクション ID が `First_test` / `Second_test` のような英語スネークケースです。これがラウンド見出しとして画面にそのまま出ないようにしてください
- ツアーは 8/7 に開幕済みで、実装時点で数試合が終了している可能性があります。終了済み試合のスコアが既存パイプラインで取り込まれるかを確認し、取り込まれないなら報告してください

やらないこと:
- チームの新規登録・`teams` の変更
- 大会専用ページテンプレートの新規作成（既存の `app/c/[competition]/[season]/page.tsx` に乗せる）
- 順位表機能の実装
- 放送情報の投入
- 他大会の取り込みモジュールの変更
- `parseWikipediaSixNationsHtml` の**パースロジック**の変更

**例外（2026-08-07 追記・Owner 承認済み）**: `lib/ingestion/sources/wikipedia-six-nations.ts` の `TIMEZONE_OFFSETS`（6〜21行）に **`EDT: -4` を追加してよい**。

当初の指示書は「`parseWikipediaSixNationsHtml` 本体の変更」を一律で禁止していたが、これは受け入れ条件4（第4テストの EDT を正しく UTC 変換する）と矛盾していた。同対応表に `EDT` が存在せず、90行目の `TIMEZONE_OFFSETS[params.timezoneText ?? "UTC"] ?? 0` により未知値がオフセット0にフォールバックするため、`2026-09-12 17:00 EDT` が `17:00Z`（正しくは `21:00Z`）となり4時間ずれる。

- 追加してよいのは `EDT: -4` の1エントリのみ。パースロジック・関数シグネチャ・他の既存エントリには触れないこと
- 既存エントリ（`AEDT` `AEST` `ART` `BST` `CEST` `CET` `FJT` `GMT` `JST` `NZDT` `NZST` `PDT` `SAST` `TOT` `UTC`）の値は変更しないこと
- `EDT` を追加しても他大会の既存取り込みに影響が出ないことを既存テストで確認すること

テスト:
- パーサのフィクスチャは**実際に取得した Wikipedia ページから起こす**こと。手作りの HTML を書かないこと（過去に手作りフィクスチャが実データで壊れた事例があります）
- 8試合すべてが抽出されること
- 第4テストの `kickoff_at` が EDT 基準で正しく UTC 変換されること
- 全8試合の両チームが既存 slug に解決されること
- Wikipedia ページが取得できないときに空配列を返すこと

完了の定義:
- spec の受け入れ条件1〜10をすべて満たす
- `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` clean
- 変更ファイル一覧を報告する

完了時:
- 実装内容を要約する
- ローカルで `/c/greatest-rivalry/2026` を開いたスクリーンショットを添えて報告する。8試合が日本時間で並んでいること、順位表タブが破綻していないことが分かるように
- 終了済み試合のスコアが取り込まれるかどうかの確認結果を報告する
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する

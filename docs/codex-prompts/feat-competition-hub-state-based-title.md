`/specs/feat-competition-hub-state-based-title.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- `fix-competition-hub-title-ctr.md`（マージ済み）で大会ハブのtitleを統一改善済み。本specはその`generateMetadata()`実装を上書きし、開催状態で切り替える
- 「開催中=最新順位」「開催後=最終順位・日本語レビュー」という単純な文言は、順位表を持たない大会（`lipovitan-challenge-cup-2026`）やrecapが0本の大会で成立しない
- `AGENTS.md`は「エラーを握り潰してPromiseをresolveする（throwが基本）」を禁止している。放送情報有無チェックでクエリが失敗した場合は**throwする**
- **重要（3回目レビューで確定）**: 状態判定は以下のアルゴリズムに一本化する:
  ```ts
  const activeMatches = matches.filter((match) => match.status !== "cancelled");
  if (activeMatches.length === 0) {
    // 大会情報のみ
  } else if (activeMatches.every((match) => match.status === "scheduled")) {
    // 開催前
  } else if (activeMatches.every((match) => match.status === "finished")) {
    // 開催後
  } else {
    // 開催中
  }
  ```
- 「開催中に順位表があれば・順位を追加してよい」は不定な表現だったため確定: `getStandingsForCompetition`の結果が1件以上あれば**必ず**「・順位」を追加する

やること:
- `generateMetadata()`内で`listMatchesForCompetition(comp.slug)`・`getStandingsForCompetition(comp.slug)`・`getMatchBroadcastPresenceForMatches`・`getContentStatusForMatches`を呼び、上記アルゴリズムで状態を判定する
- 状態別のtitle:
  - 大会情報のみ「大会情報・見どころ」
  - 開催前・放送情報あり「日程・放送予定・見どころ」
  - 開催前・放送情報なし「日程・見どころ」
  - 開催中・順位表あり「最新結果・次戦・日程・順位」
  - 開催中・順位表なし「最新結果・次戦・日程」
  - 開催後・recap1本以上「全試合結果・日本語レビュー」
  - 開催後・recap0本「全試合結果」
- `family === "six-nations"`の「6カ国対抗」併記は全状態で維持する

処理すべきエッジケース:
- 試合0件・全cancelledの大会でクラッシュしない
- `scheduled`+`cancelled`混在は「開催前」、`finished`+`cancelled`混在は「開催後」として扱われることをテストで検証する
- 順位表0件の大会（`lipovitan-challenge-cup-2026`）でtitleに「順位」を含めない
- 放送情報クエリが失敗した場合はcatchせずthrowする。「放送情報なし」は正常終了かつ0件の場合のみ

完了の定義:
- specの受け入れ条件1〜12を満たす
- `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean
- 変更ファイル一覧を報告する

要件:
- ページ本体のUI（`SeasonSummaryBand`等）は変更しない
- OG画像・構造化データの状態別変更はしない
- 大会ハブ画面への放送情報の表示は行わない（titleの文言判定にのみ使う）
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する

完了時:
- 実装内容・変更ファイルを要約する
- 実データでの各状態のtitle生成例（`nations-championship-2026`=開催中・順位表あり、`six-nations-2026`=開催後recap有り、`lipovitan-challenge-cup-2026`=開催前・順位表なし確認）を報告に含める
- 仕様書からの逸脱があれば理由を明示する
- 未解決の質問があれば記載する

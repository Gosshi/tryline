`specs/fix-unknown-team-silent-skip.md` の仕様を実装してください。

**着手前に必ず読むこと**: `lib/ingestion/sources/live-source-utils.ts` の 135-140行。**警告を出してスキップする既存実装**です。文面と形式をここに揃えます。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- 過去の判断は `docs/decisions.md` を読む
- **調査済みの事実（再調査不要。2026-08-09 に本番実行して確認）**:
  - Premiership 2026-27 の取り込みは `inserted=72` で成功し、**警告は1件も出なかった**
  - しかし Wikipedia の正しい構成は **10チーム・18ラウンド・90試合**。18試合が欠落していた
  - 欠落は **Newcastle Red Bulls**（9対戦 × ホーム/アウェー = 18試合）。72 + 18 = 90 で一致
  - DB には `newcastle-falcons`（name: `Newcastle Falcons`、name_ja: `ニューカッスル・ファルコンズ`）として登録済み。**Red Bull 出資に伴うリブランドで名前が一致しなかった**
  - `wikipedia-premiership.ts` 95-97行が `if (!homeTeamName || !awayTeamName || !homeTeamSlug || !awayTeamSlug) { continue; }` で**無言スキップ**している
  - 同ファイル 99-106行のキックオフ解析失敗には警告がある（PR #676 で追加）。**チーム解決だけ無言**という非対称
  - **同じ無言スキップが4ファイルにある**: `wikipedia-premiership.ts` / `wikipedia-super-rugby-pacific.ts` / `wikipedia-top-14.ts` / `wikipedia-urc.ts`。うち後ろ3つは `console.warn` が0件
  - `live-source-utils.ts` の `mapWithTeamSlugs` は警告を出す実装で、Nations Championship 等はこちらを経由している
- 変更対象:
  - `lib/ingestion/sources/wikipedia-premiership.ts`
  - `lib/ingestion/sources/wikipedia-super-rugby-pacific.ts`
  - `lib/ingestion/sources/wikipedia-top-14.ts`
  - `lib/ingestion/sources/wikipedia-urc.ts`

実装のポイント:
- **`Newcastle Falcons`（旧名）のエントリを消さないこと。** 過去シーズンの Wikipedia ページは旧名で書かれており、`lib/scrapers/wikipedia-premiership-results.ts` 経由の履歴取り込みが壊れます。**新旧どちらも `newcastle-falcons` へ解決させてください**
- 警告の文面・形式は `live-source-utils.ts` 135-140行に揃えること。新しい方式を発明しないでください
- **解決できなかった側のチーム名がログから分かること。** 「どちらが未登録か」が分からないと調査に使えません
- **スキップする条件自体は変更しないこと。** 警告を足すだけです

エッジケース:
- チーム名は取れたがスラッグが解決できない場合と、チーム名自体が取れない場合の両方でログが読めること
- 警告が大量に出る大会（Top 14 は正規シーズンが丸ごと欠落している疑いがある）でもログが破綻しないこと
- 旧名・新名の両方が同じ試合表に混在する可能性

やらないこと:
- **`teams` テーブルの `name` 変更**。表示名を「Newcastle Red Bulls」へ改称するかは Owner 判断です。過去シーズンのページ表示にも影響します
- **`newcastle-falcons` の slug 変更**。URL が変わり既存ページが 404 になります
- Top 14 の正規シーズン欠落の解消（既知の別課題。本 spec は検出手段を用意するに留めます）
- 4ファイルの個別実装を `mapWithTeamSlugs` へ統合するリファクタ（有用ですが範囲が広いため別途）
- 取り込み済みデータの修正

テスト:
- `Newcastle Red Bulls` が `newcastle-falcons` へ解決されること
- `Newcastle Falcons`（旧名）も引き続き解決されること
- **チーム解決に失敗した試合で警告が出ること**（4ファイルそれぞれ）
- 警告に解決できなかったチーム名が含まれること
- スキップの条件自体が変わっていないこと

完了の定義:
- spec の受け入れ条件1〜7をすべて満たす
- `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` clean
- 変更ファイル一覧を報告する

完了時:
- 実装内容を要約する
- **Wikipedia の 2026-27 Premiership ページで Newcastle がどう表記されているかを確認し、マッピングに追加した文字列を報告してください**
- 4ファイルそれぞれで警告を追加した箇所を示してください
- **他にリブランドや表記ゆれで解決できなさそうなチームがあれば報告してください**（SRP・Top 14・URC のチーム名マップを一読した所感で構いません）
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する

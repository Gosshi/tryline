`/specs/fix-competition-hub-title-ctr.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- 2026-07-21、GSC実測（2026-06-21〜07-18）で`/c/pnc/2026`（順位10.1・92imp・2クリック）・`/c/six-nations/2026`（順位11.0・71imp・2クリック）がこの順位帯にしては低CTRであることが判明した。実際の検索クエリに「6カ国対抗」という現在のタイトルにない通称が含まれていた

やること:
- `app/c/[competition]/[season]/page.tsx`の`generateMetadata()`で、title/descriptionの「順位」という語をタイトルの前寄り（大会名の直後）に配置するよう語順を調整する
- `family === "six-nations"`の場合のみ、title または description に「6カ国対抗」という通称を追加する（例: `シックス・ネイションズ（6カ国対抗）2026 順位表・日程・結果`）。他の大会ファミリーの出力は変えない

処理すべきエッジケース:
- `family !== "six-nations"`の他の大会（pnc, urc, top-14等）のtitle/descriptionに「6カ国対抗」が混入しないこと
- OGタイトル（`openGraph.title`）も同じtitle文字列を使っている箇所があれば整合させる

完了の定義:
- specの受け入れ条件1〜5を満たす
- `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean
- 変更ファイル一覧を報告する

要件:
- `app/c/[competition]/page.tsx`（シーズン指定なしのファミリーハブ）は変更しない
- OG画像・構造化データ（jsonLd等）は変更しない
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する

完了時:
- 実装内容・変更ファイルを要約する
- `/c/pnc/2026`・`/c/six-nations/2026`・他の大会（例: `/c/urc/2025-26`）の生成後titleの実例を報告に含める
- 仕様書からの逸脱があれば理由を明示する
- 未解決の質問があれば記載する

`/specs/feat-nations-championship-southern-hemisphere-flags.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- Nations Championship 2026の試合ストーリー画像(`app/api/og/route.tsx`のtype=story)で、New Zealand・Australia・Argentina・Fiji・South Africaの5か国が国旗ではなくチームカラーの色ブロック(`getTeamStripeGradient()`)で表示されている。原因は`lib/format/team-identity.ts`の`TEAM_FLAGS`(6-37行目)にこの5か国のSVG国旗が無く絵文字のみのため、`getTeamFlagSvg()`(231-239行目)が空文字列を返し、`storyFlagChip()`(`app/api/og/route.tsx` 184-235行目)が色ブロックにフォールバックしている
- 既存7か国(England・Scotland・Wales・France・Ireland・Italy・Japan)は`viewBox="0 0 513 342"`のシンプルなSVG文字列が直接埋め込まれている(11-26行目参照)

やること:
1. `country-flag-icons`パッケージ(npm、MIT license。[gitlab.com/catamphetamine/country-flag-icons](https://gitlab.com/catamphetamine/country-flag-icons)の`3x2/`ディレクトリに各国SVGがある)から、AR(Argentina)・AU(Australia)・FJ(Fiji)・NZ(New Zealand)・ZA(South Africa)のSVGマークアップを取得する
2. `lib/format/team-identity.ts`の`TEAM_FLAGS`オブジェクトで、この5か国のエントリ(現在は絵文字文字列)をSVG文字列に置き換える。既存パターンと同じ「SVG文字列をTS定数に直接埋め込む」形式を維持し、新規npm依存は追加しない(ビルド時に1回コピーするだけ)
3. viewBoxは取得元のものをそのまま使ってよい(既存の513×342に無理に合わせる必要はない。3:2比率であれば見た目は揃う)

処理すべきエッジケース:
- 5か国以外の絵文字のみの国(Canada・Chile・Georgia・Namibia・Portugal・Romania・Samoa・Spain・Tonga・Uruguay・USA)は変更しない
- `getTeamFlag()`(絵文字取得関数)はそのまま残す(他の用途で使われている可能性があるため削除しない)
- `getTeamStripeGradient()`関数自体も削除しない(対象外の国のフォールバックとして引き続き必要)

入出力の例:
- 変更前: `getTeamFlagSvg("new-zealand")` → `""`(空文字列)
- 変更後: `getTeamFlagSvg("new-zealand")` → `'<svg xmlns="http://www.w3.org/2000/svg" viewBox="..." >...</svg>'`(非空、`<svg`で始まる文字列)

完了の定義:
- specs の受け入れ条件1〜4を満たす(5はOwnerが目視確認するためスコープ外)
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` clean
- 変更ファイル一覧を報告する(想定: `lib/format/team-identity.ts`、関連テストファイル)

要件:
- 「対象外」(5か国以外への追加、`getTeamFlag()`の変更、モバイルリポジトリの修正)は実装しない
- SVGの著作権/出典: 国旗自体は著作権保護対象外(公的な意匠)。`country-flag-icons`はMITライセンスでの再配布を許可しているため、SVGマークアップをそのままコピーして問題ない
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する

完了時:
- 実装内容・変更ファイルを要約する
- 使用したSVGの取得元(具体的なURL)を明記する
- 仕様書からの逸脱があれば理由を明示する
- 未解決の質問があれば記載する

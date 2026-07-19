# Nations Championship 南半球5か国のSVG国旗を追加(ストーリー画像の色ブロック表示を解消)

## 背景

Owner がモバイルアプリで試合ストーリー画像(`app/api/og/route.tsx` の `type=story`)を確認したところ、New Zealand vs Ireland の対戦カードで、**アイルランドは正しい国旗(緑・白・オレンジ)が表示される一方、New Zealandは黒/銀の色ブロックが表示され、国旗に見えない**ことを発見した(スクリーンショットで確認済み、2026-07-19)。同様にAustralia・Argentinaでも同じ現象が発生するとのOwner報告。

**原因**(コード確認済み):
- `lib/format/team-identity.ts` の `getTeamFlagSvg()`(231-239行目)は、`TEAM_FLAGS` の値が `<svg` で始まる文字列の場合のみSVGを返し、それ以外(絵文字文字列)は空文字列を返す
- 実SVGを持つのは England・Scotland・Wales・France・Ireland・Italy・Japan の7か国のみ(6 Nations + 日本)。Argentina・Australia・Fiji・New Zealand・South Africa・その他は絵文字(`🇦🇷`・`🇦🇺`等)しか持たない
- `app/api/og/route.tsx` の `storyFlagChip()`(184-235行目)は、`getTeamFlagSvg()` が空文字列の場合、絵文字ではなく `getTeamStripeGradient(team.slug)`(171-183行目、チームカラーの帯グラデーション)にフォールバックする。これは `@vercel/og`(Satoriベースの画像生成エンジン)が絵文字を正しくレンダリングできない制約への対処と見られる
- **Nations Championship 2026 の参加12か国のうち、Argentina・Australia・Fiji・New Zealand・South Africa の5か国がこの経路に該当**し、ストーリー画像で国旗ではなくチームカラーの色ブロックが表示される。過去の `feat-match-stories-flag-cards.md` で「SVG旗は6N+日本のみ」と意図的にスコープを絞った経緯があるが、NC開幕によりこのギャップが実際に表面化した

**再利用可能なSVGソース**: ゼロから作図する必要はない。`country-flag-icons`(npm、MIT license、[gitlab.com/catamphetamine/country-flag-icons](https://gitlab.com/catamphetamine/country-flag-icons)、週1.9M DL)が ISO 3166-1 alpha-2 国コードごとに3:2比率のSVG国旗を配布している。既存の7か国分のSVG(`lib/format/team-identity.ts` 11-26行目)もviewBox `"0 0 513 342"`(3:2比率)であり、同系統のシンプルな幾何学的フラグ表現と視覚的に整合する。対象コード: Argentina=AR, Australia=AU, Fiji=FJ, New Zealand=NZ, South Africa=ZA。

## スコープ

対象:
1. `country-flag-icons` パッケージ(または `https://gitlab.com/catamphetamine/country-flag-icons` の `3x2/` ディレクトリ)から、AR・AU・FJ・NZ・ZA の5か国分のSVGマークアップを取得し、`lib/format/team-identity.ts` の `TEAM_FLAGS`(6-37行目)の該当エントリを絵文字からSVG文字列に置き換える
2. SVGは新規npm依存を追加せず、既存の7か国と同じ「SVG文字列をTS定数として直接埋め込む」パターンを踏襲する(ライブラリをランタイム依存に追加しない。ビルド時に一度コピーするだけ)
3. viewBoxやfill形式は既存7か国のスタイル(シンプルな幾何学模様、`viewBox="0 0 513 342"`目安)に近い見た目になるよう調整してよいが、正確性(色・比率・意匠)を優先する

対象外:
- 上記5か国以外の残り絵文字のみの国(Canada・Chile・Georgia・Namibia・Portugal・Romania・Samoa・Spain・Tonga・Uruguay・USA)へのSVG追加。今回はNations Championship 2026の実参加国のみに絞る
- `getTeamFlag()`(絵文字取得、227-229行目)自体の変更。SVGが追加された国でも絵文字定義は残してよい(他の用途で使われている可能性があるため)
- モバイルアプリ側(`tryline-mobile`)のスコアカード表示不具合(別リポジトリ、本specのスコープ外。`feat-team-flag-identity.md`で導入された`flag_code`絵文字ベースの表示のため、今回のSVG追加とは無関係)
- `getTeamStripeGradient()` 自体の削除。SVGが無い残りの国(上記対象外リスト)には引き続き必要なフォールバックとして残す

## データモデル変更

なし。

## API サーフェス

なし。

## UI サーフェス

`app/api/og/route.tsx` の `type=story` 画像で、Argentina・Australia・Fiji・New Zealand・South Africa が対戦相手または当事者になるストーリーカードのflag chipが、色ブロックではなく実際の国旗になる。

**デザイン確認事項**: 既存7か国のSVGスタイル(単純な縦帯・横帯・円形等の幾何学フラグ)と並んだときに違和感がないか、Owner が実際のストーリー画像(New Zealand vs Ireland等)で目視確認する。

## LLM 連携

なし。

## 受け入れ条件

1. `getTeamFlagSvg("new-zealand")`・`getTeamFlagSvg("australia")`・`getTeamFlagSvg("argentina")`・`getTeamFlagSvg("fiji")`・`getTeamFlagSvg("south-africa")` が、いずれも `<svg` で始まる非空文字列を返すことを確認するユニットテストがある
2. `storyFlagChip()` がこれら5か国に対して `getTeamStripeGradient()` ではなく実SVGを使う分岐に入ることを確認するテスト(既存の分岐テストがあれば流用・拡張)がある
3. 上記5か国以外(既存7か国・絵文字のみの残り国)の挙動に変化がない(既存テストが変更なく通る)
4. `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` が通る
5. **Owner目視確認**: New Zealand vs Ireland、Australia vs Italy 等、実際にNCで対戦するカードのストーリー画像(portrait/landscape 両方)をスクリーンショットで確認し、5か国とも国旗として認識できる見た目になっていること

## 未解決の質問

- モバイルアプリ側のスコアカード(「JPN 15-42 FRA」のようなカレンダー/試合カードでスコア数字が枠からはみ出る不具合)は、`tryline-mobile` リポジトリ側の別問題。本specでは扱わない。Owner が該当画面・リポジトリへのアクセスを提供すれば別specで調査する

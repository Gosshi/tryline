# fix-lipovitan-challenge-cup-scraper-rugbybox-parsing: 実ページの構造に合わせてパーサーを修正

## 背景

2026-07-21、PR #626（`feat-lipovitan-challenge-cup-2026.md`）マージ後、Ownerが実際に本番向けスクリプトを実行したところ以下のエラーで失敗した:

```
Error: Expected 4 Lipovitan Challenge Cup matches, got 2.
    at main (/Users/gota/Documents/src/tryline/scripts/import-lipovitan-challenge-cup-results.ts:120:15)
```

`EXPECTED_MATCH_COUNT`のチェックがDB書き込み（`upsertCompetition`/`upsertMatches`）より前にあるため、**本番DBへの書き込みは発生していない**（実害なし）。

実際に対象ページ（`https://ja.wikipedia.org/wiki/リポビタンDチャレンジカップ2026`）をfetchして構造を確認したところ、`lib/scrapers/wikipedia-lipovitan-challenge-cup-results.ts`の`parseJapaneseFixtureRows()`が前提としている「`<table><tr><td>`の単純な行構造をcheerioの`.text()`で読む」というアプローチが、実ページの構造と一致していないことが判明した。

実ページは各試合を **`rugbybox`という Wikipedia テンプレート**で描画しており、Parsoid出力のHTMLは以下の形（4試合とも同型）:

```html
<table ... data-mw='{"parts":[{"template":{"target":{"wt":"rugbybox\n"},"params":{
  "date":{"wt":"2026年8月8日(土)"},
  "time":{"wt":"19:05 [[日本標準時|JST]] ([[UTC+9]])"},
  "home":{"wt":"{{ru-rt|JPN}}"},
  "away":{"wt":"{{RU|AUS}}"},
  "score":{"wt":""},
  "stadium":{"wt":"[[東大阪市花園ラグビー場]] ([[大阪府]][[東大阪市]])"},
  ...
}}}]}'>
  <td ... rowspan="3">2026年8月8日(土)<br/>19:05 <a>JST</a> (<a>UTC+9</a>)</td>
  ...
</table>
```

重要な点:
- `date`と`time`は**別々のtemplateパラメータ**であり、レンダリング後のセルでは`<br/>`で区切られている。現行コードの正規表現`/(?:^|\s)(\d{1,2}):(\d{2})(?:\s|$)/`は時刻の直前に空白境界を要求するが、`<br/>`はcheerioの`.text()`で空白に変換されないため、"（土)19:05"のように空白なしで連結され、時刻の抽出に失敗する
- チーム名は最終レンダリングテキストではなく `{{ru-rt|JPN}}`（home側）/ `{{RU|AUS}}`・`{{RU|CAN}}`・`{{RU|FIJ}}`（away側）という**未展開のwikitextマクロ**が`data-mw`のJSON内に入っている。3文字の国コード（JPN/AUS/CAN/FIJ）で判定する必要がある
- 4試合（JAPAN XVの試合含む）はすべて同じ`rugbybox`テンプレートの個別transclusionとして存在し、`data-mw`のJSON抽出で構造的に確実に取得できる

このリポジトリには既にこのテンプレートを正しく扱う実装がある: `lib/scrapers/wikipedia-league-one-playoffs.ts`の`collectRugbyboxTemplates()`（`data-mw`属性のJSONを再帰的に走査し`template.target.wt`が`/rugbybox/i`にマッチするものを収集する関数）。**この既存パターンをそのまま踏襲すること**。

現行の`parseJapaneseFixtureRows()`のテスト（`tests/scrapers/wikipedia-lipovitan-challenge-cup-results.test.ts`の`JAPANESE_HTML`フィクスチャ）は、実際のPage構造を反映しない手作りの単純なテーブルHTMLで書かれていたため、テストは通っていたが実ページに対しては機能しなかった。**同じ失敗を再発させないため、今回は実際にfetchしたページのHTML片（本spec記載の構造、または実際にWebFetch/curlで取得したもの）をテストフィクスチャに使うこと**。

## スコープ

対象:
- `lib/scrapers/wikipedia-lipovitan-challenge-cup-results.ts`の`parseJapaneseFixtureRows()`（および`parseLipovitanChallengeCupResultsHtml()`）を、`data-mw`属性のJSON（`rugbybox`テンプレートの`params.date` / `params.time` / `params.home` / `params.away` / `params.score` / `params.stadium`）を読む実装に書き換える。`lib/scrapers/wikipedia-league-one-playoffs.ts`の`collectRugbyboxTemplates()`と同等のヘルパーを踏襲・再利用する
- `home`/`away`パラメータの国コード抽出: `{{ru-rt|JPN}}`形式（home）・`{{RU|XXX}}`形式（away）の両方から3文字コードを取り出し、`JPN→japan`・`AUS→australia`・`CAN→canada`・`FIJ→fiji`（および`JAPAN XV`・マオリ・オールブラックスは対象外のため無視してよい）にマッピングする
- `date`パラメータ（例: `2026年8月8日(土)`）と`time`パラメータ（例: `19:05 [[日本標準時|JST]] ([[UTC+9]])`）はそれぞれ独立した文字列として渡ってくるため、`<br/>`区切りの連結テキストに依存しない、パラメータ単位でのパースに書き換える
- `score`パラメータが空文字列でない場合（例: JAPAN XV戦の`"31-38&lt;br />&lt;small>24-前半-7&lt;/small>"`のような複雑な文字列）は、先頭の`\d+-\d+`のみを抽出してスコアとする
- `tests/scrapers/wikipedia-lipovitan-challenge-cup-results.test.ts`のテストフィクスチャを、実際にfetchした本物のページ構造（本spec記載の`data-mw` JSON構造）に基づいたものに書き換える

対象外:
- `parseAustraliaJapanTestSeriesResultsHtml()`（英語版Wikipedia、Townsville戦）・`parseJapanFijiOfficialResultsHtml()`（JRFU公式、フォールバック）は今回のエラーの原因ではない（実行時に2件が返っていたのはこの2つの関数からで、正しく機能している）。変更不要
- `scripts/import-lipovitan-challenge-cup-results.ts`のロジック変更（`EXPECTED_MATCH_COUNT`のチェックは正しく機能し、不完全なデータの書き込みを防いだため、そのままでよい）
- 大会・チーム表示設定（`FAMILY_DISPLAY_NAMES`・`COMPETITION_DESCRIPTIONS`）の変更は対象外（前回のPRで対応済み）

## データモデル変更

なし。

## API サーフェス

なし。

## LLM連携

なし。

## 受け入れ条件

1. `parseLipovitanChallengeCupResultsHtml()`に、本spec記載の実ページ相当の`data-mw` rugbyboxテンプレート構造を持つHTML（JAPAN XV戦・オーストラリア戦・カナダ戦・フィジー戦の4テンプレート transclusion）を渡すと、JAPAN XV戦を除いた3試合（対オーストラリア・カナダ・フィジー、いずれもホームは日本）が正しい日時・会場で返る
2. 日時抽出が`date`・`time`パラメータを個別に読む実装になっており、`<br/>`によるテキスト連結に依存しない
3. `home`/`away`の国コード（`JPN`/`AUS`/`CAN`/`FIJ`）が正しくチームslugにマッピングされる
4. `pnpm tsx scripts/import-lipovitan-challenge-cup-results.ts 2026`を実データに対して実行すると、`Expected 4 ... got 2`のようなエラーが発生せず、4試合（本関数由来の3試合＋Townsville戦1試合）が正しく返る
5. テストフィクスチャが実際のページ構造（`data-mw` JSON形式）を反映したものになっている（旧来の単純な`<table><tr><td>`フィクスチャに戻さない）
6. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る
7. 本番DBへの実際の書き込み（スクリプト実行）はOwner承認後に別途行う

## 未解決の質問

なし。

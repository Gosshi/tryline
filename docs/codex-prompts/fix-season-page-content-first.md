# Codex 指示書: シーズンページで試合情報を先に見せる

仕様書: `specs/fix-season-page-content-first.md`
受け入れ条件は仕様書を正とする。ここでは繰り返さない。

`AGENTS.md` の規約に従う。仕様書と実コードが食い違ったら（行番号のずれ以上の違い）、実装を進めずその場で止めて Owner に確認する。

## やること

仕様書の UI サーフェス 1〜3 を実装する。

1. `<NewsletterSignup source="competition" />` を `<header>` の中から、`#guide` の直前へ移す。
2. ヒーロー下の帯から「次節 第N節」のリンクを削除し、「首位」「進行」だけにする。
3. `SeasonSummaryBand` から「首位」を外し、`lg:grid-cols-3` にする。

## 触るファイル

- `app/c/[competition]/[season]/page.tsx`
- `tests/app/season-page-ia.test.tsx`

## 守ること

- `components/season-match-groups.tsx` と `components/newsletter-signup.tsx` は変更しない。
- `getSeasonProgress` の算出方法は変えない（「進行」の表示に引き続き使う）。
- 色・余白・フォントは変えない。ニュースレター登録の外側に個別の余白（`mt-5` など）を付けない。
- 既存のテストは消さない。落ちる assert は新しい期待値に書き換え、PR 本文に一覧を書く。

## 処理すべきエッジケース

1. 順位表が無い大会（`hasStandings` が false）: ニュースレター登録は `#schedule` の直後、`#guide` の直前に出る。
2. 開幕前（`seasonNotStarted`、`leaderLabel` が null）: ヒーロー下の帯は「進行」だけになり、列指定が付かない。
3. 節の情報が無い大会（`getSeasonProgress` が null）で首位だけある場合: ヒーロー下の帯は「首位」だけ。
4. 首位も進行も無い場合: ヒーロー下の帯自体を出さない。
5. `SeasonSummaryBand` の項目が 0 件のとき: 今までどおり何も出さない（`return null`）。

## 検証

- 型チェック・lint・テスト・ビルド（`pnpm tsc --noEmit`・`pnpm lint`・`pnpm test`・`pnpm build`）を実行する。**すべて必ず実行し、結果を完了報告に含める。**
- 仕様書の受け入れ条件 6 の `grep` は、標準エラーを捨てずに実行し、出力を PR 本文に貼る。
- 「壊して落ちる」確認（コミットしない）: 仕様書の受け入れ条件 7 の 3 つ。失敗の出力を PR 本文に貼る。
- 仕様書の受け入れ条件 8 の画面（`/c/pnc/2026` と `/c/top-14/2026-27`、幅 1440 と 375）を撮る。

## やってはいけないこと

- 本番へのデプロイ。
- 仕様書の「対象外」に手を付けること（ページ内ナビ・日本代表の試合ブロック・iOS アプリの案内の位置、大会トップ・節ページ）。

## 完了時

- PR 本文に書くこと:
  - 変更したファイルの一覧
  - 受け入れ条件 1〜9 の確認の方法と結果
  - 書き換えた既存の assert の一覧（ファイル・行・変更前→変更後）
  - 「壊して落ちた」確認の内容と出力
  - 画面の画像（または保存先）
- ブランチは main から新しく切る。共有の作業ツリーにある未コミットの差分を巻き込まない。`git stash -u` は使わない。
- PR の作成まで。マージはしない。

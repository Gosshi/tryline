# Codex 指示書: 大会ページのタイトル・説明文を、検索した人の知りたいことに合わせる

仕様書: `specs/fix-competition-hub-search-snippets.md`（受け入れ条件は仕様書を正とする）。

`AGENTS.md` の規約に従う。**最新の `origin/main` からブランチを切る。** 仕様書と実際のコードが食い違っていたら（行番号の先の処理、関数名・型が違う等）、実装を進めずにその場で止めて報告する。

## やること
- `lib/format/season-summary.ts` に `formatCompetitionBroadcastSentence` を足し、`getSeasonBroadcastGuide` の大会単位の文をこの関数で作る（`answer` の文字列は変えない）
- `app/c/rwc/2027/page.tsx`: 静的 `metadata` を `generateMetadata` にし、仕様書「API サーフェス 1」のタイトル・説明文にする
- `app/c/[competition]/page.tsx`: `generateMetadata` を仕様書「API サーフェス 2」にする。最新シーズンの決め方はページ本体（`:126` 付近）と同じ関数を使う
- `app/c/[competition]/[season]/page.tsx`: 説明文の「日本語レビュー」重複を直し、視聴情報の 1 文を足す（仕様書「API サーフェス 3」）
- 受け入れ条件 1〜7 のテスト

## 守ること
- 文言は仕様書の期待値と完全一致させる（句読点・全角括弧・「・」を含む）
- データ取得のエラーで `generateMetadata` を落とさない（`console.error` して、仕様書の代わりの文で返す）
- ページ本文・h1・構造化データ・英語ページを変えない
- 既存テストの期待値を変えない・弱めない・消さない。例外は「日本語レビュー」の重複が直ることで変わる期待値だけで、変えた箇所と理由を PR 本文に書く
- `generateMetadata` に依存を足すと、既存テストのモック不足で落ちることがある。`rg "generateMetadata" tests/app` で対象を洗い出してモックを足す

## 検証
- `pnpm tsc --noEmit`・`pnpm lint`・`pnpm test`・`pnpm build`。**すべて実行し、結果を完了報告に含める。**
- PR 本文に貼るもの:
  - 受け入れ条件 8 の (a)・(b) で落ちたテストの出力（変更は戻す）
  - 受け入れ条件 10（プレビューの 4 ページの `<title>` と description）。SSO で開けなければ保留と書く（Claude Code が確認する）
- マージ前に `gh pr checks` が緑であること
- PR を出したら、マージを待つ

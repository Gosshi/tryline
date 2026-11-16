# Codex 指示書: 対戦成績ページを、次の試合の入口にする

仕様書: `specs/feat-h2h-next-match-viewing.md`（受け入れ条件は仕様書を正とする）。

`AGENTS.md` の規約に従う。**最新の `origin/main` からブランチを切る。** 仕様書と実際のコードが食い違っていたら（行番号の先に該当の処理がない、関数名や引数が違う、等）、実装を進めずにその場で止めて報告する。

## やること
- `app/h2h/[pair]/page.tsx`
  - 次の試合 1 件分の放送データを `getMatchBroadcastsForMatches`（`lib/db/queries/match-broadcasts.ts:48`）で読む。`react` の `cache` で包み、`generateMetadata` とページ本体で重複して取得しない。例外のときは空として扱い、`console.error` を 1 行出す
  - `NextMatchCta`（`:432`）に、放送・配信の一覧、確認日、`hasPreview` のときだけ「プレビューを読む →」を足す（仕様書「UI サーフェス」）
  - `generateMetadata`（`:64`）で、14 日以内に次の試合があるときだけ、description の先頭に 1 文足す（仕様書「メタデータ」）。**title は変えない**
- `components/match-header.tsx:50` の `formatBroadcastVerifiedDate` を `lib/` 側へ移して共通化する。`match-header.tsx` の表示は変えない
- 受け入れ条件 1〜8 のテストを `tests/app/h2h-page.test.tsx` に足す。時刻は `vi.useFakeTimers` で固定する（同じファイル内の既存の使い方に合わせる）

## 守ること
- 既存テストの期待値を変えない・弱めない・消さない。特に `tests/app/h2h-page.test.tsx:458` の title の期待値
- 放送データが 0 件のとき「未定」「未発表」などを書かない（データがないことを事実のように書かない）
- 既存の `cta_id: "h2h_next_match"` を変えない。プレビューリンクは `h2h_next_match_preview`
- 本番 DB に触らない。放送データの取り込みや追加をしない

## 検証
- `pnpm tsc --noEmit`・`pnpm lint`・`pnpm test`・`pnpm build`。**すべて実行し、結果を完了報告に含める。**
- PR 本文に貼るもの:
  - 受け入れ条件 8（(a)・(b) で落ちたテストの出力。変更は戻す）
  - プレビュー環境の `/h2h/japan-vs-scotland` の、375px 幅と 1280px 幅のスクリーンショット（次回対戦の欄）
  - `generateMetadata` が返す description の実際の文字列（プレビュー環境の `/h2h/japan-vs-scotland` の `<meta name="description">`）
- マージ前に `gh pr checks` が緑であること
- PR を出したら、マージを待つ。**11/18 中のマージが目安**（11/21 の試合に間に合わせる）

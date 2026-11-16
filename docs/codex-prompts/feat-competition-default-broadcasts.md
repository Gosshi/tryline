# Codex 指示書: 大会の全試合を中継するサービスを、試合ごとの視聴情報が無いときに出す

仕様書: `specs/feat-competition-default-broadcasts.md`（受け入れ条件は仕様書を正とする）。

`AGENTS.md` の規約に従う。**最新の `origin/main` からブランチを切る。** 仕様書と実際のコードが食い違っていたら（関数名・型・行番号の先の処理が違う等）、実装を進めずにその場で止めて報告する。

**期限: リーグワン開幕（2026-12-12）の前にマージしたい。**

## やること
- マイグレーション `supabase/migrations/20261116120000_create_competition_broadcasts.sql` を足す。形は `supabase/migrations/20260715020000_create_match_broadcasts.sql` に合わせ、仕様書の insert を末尾に入れる
- `lib/db/types.ts` に `competition_broadcasts` を足す（`match_broadcasts` の定義の形）
- `lib/db/queries/match-broadcasts.ts`: `MatchBroadcast` に `scope` を足し、`getMatchBroadcastsForMatches` にフォールバック（仕様書「API サーフェス 2」の手順 1〜5 と規則）、`getMatchBroadcastPresenceForMatches` を同じ判定にする
- `lib/format/season-summary.ts` の `getSeasonBroadcastGuide` の文言を、仕様書の表どおりに分ける
- `components/match-header.tsx` の視聴方法欄に、補足の 1 行を条件付きで足す
- 受け入れ条件 1〜9 のテスト

## 守ること
- 試合ごとの行がある試合に、大会の行を混ぜない
- フォールバックのクエリのエラーでページを落とさない（`console.error` して、フォールバック無しで返す）。`match_broadcasts` 自体のエラーは今どおり投げる
- `/api/v1` の返り値の形（`V1MatchBroadcast`）を変えない。`scope` を足さない
- 行が 0 件・試合単位だけのときの案内文を変えない（既存テストの期待値を変えない・弱めない・消さない。フィクスチャに `scope: "match"` を足すのはよい）
- `lib/broadcasts/ingest.ts`・`lib/db/queries/matches.ts`・`competition_guides` に触らない
- 本番 DB に触らない。マイグレーションの適用は Owner が行う

## 検証
- `pnpm tsc --noEmit`・`pnpm lint`・`pnpm test`・`pnpm build`。**すべて実行し、結果を完了報告に含める。**
- PR 本文に貼るもの:
  - 受け入れ条件 10 の (a)・(b) で落ちたテストの出力（変更は戻す）
  - 受け入れ条件 12（プレビューの表示）。マイグレーション未適用・SSO で開けない場合は、その旨を書いて保留にする（Claude Code が確認する）
  - 「マージ前に Owner がマイグレーションを本番適用する」旨
- マージ前に `gh pr checks` が緑であること
- PR を出したら、マージを待つ

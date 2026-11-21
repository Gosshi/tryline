# Codex 指示書: Discord のレビュー通知から「公式へのリプライ案」を外す

仕様書: `specs/chore-remove-official-reply-drafts.md`（受け入れ条件は仕様書を正とする）。

`AGENTS.md` の規約に従う。**最新の `origin/main` からブランチを切る。** 仕様書と実際のコードが食い違っていたら（関数名・利用箇所が他にもある等）、実装を進めずにその場で止めて報告する。

## やること
- `app/api/cron/notify-discord/route.ts`: `appendOfficialReplyFields` の呼び出しと定義、recap の `match_events` クエリと `tryScorers`、`getPlayerNameFromMetadata`、`MatchEventRow`、`lib/x/reply-text` の import を消す
- `lib/x/reply-text.ts`・`tests/lib/x/reply-text.test.ts` を消す
- `tests/api/notify-discord.test.ts` を仕様書の受け入れ条件 5 のとおり直す

## 守ること
- 消す前に `rg "buildOfficialReplyText|reply-text|getPlayerNameFromMetadata|MatchEventRow|TryScorer"` で利用箇所を確認する。route 以外で使われていたら止めて報告する
- ①〜③の欄・preview 通知・webhook の選び方・`discord_notified_at` の更新に触らない
- 受け入れ条件 5 に挙げたもの以外の既存テストの期待値を変えない・弱めない・消さない

## 検証
- `pnpm tsc --noEmit`・`pnpm lint`・`pnpm test`・`pnpm build`。**すべて実行し、結果を完了報告に含める。**
- PR 本文に、受け入れ条件 6 で落ちたテストの出力（変更は戻す）と、テストを変えた理由を貼る
- マージ前に `gh pr checks` が緑であること
- PR を出したら、マージを待つ

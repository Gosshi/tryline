既存のPR #495（ブランチ `codex/feat-world-rugby-rankings-ingestion`）に対する修正依頼です。新規PRは作らず、このブランチに修正コミットを追加してください。

見つかった不具合:
- `lib/db/types.ts` で、今回のマイグレーション（`supabase/migrations/20260708010000_add_team_world_ranking.sql`）は `public.teams` テーブルにのみ `world_ranking` / `world_ranking_updated_at` カラムを追加しているが、**`competition_guides` テーブルの型定義（Row/Insert/Update）にも誤って同じ2フィールドが追加されている**。マイグレーションは `competition_guides` を一切変更していないため、これは実際のDBスキーマと一致しない誤った型定義（コピペミスと思われる）

修正内容:
- `lib/db/types.ts` の `competition_guides` テーブルの型定義（Row / Insert / Update の3箇所）から、誤って追加された `world_ranking` / `world_ranking_updated_at` フィールドを削除する
- `teams` テーブルの型定義（同じく Row / Insert / Update）に追加されている方はそのまま残す（正しい）

処理すべきエッジケース:
- `competition_guides` を扱う既存コードで、削除するフィールドを参照している箇所がないことを確認する（無いはずだが念のため `grep -rn "world_ranking" app lib` で確認すること）

完了の定義:
- `lib/db/types.ts` の `competition_guides` から該当フィールドが完全に削除されている
- `teams` の型定義には引き続き正しく存在する
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean

要件:
- 他のファイル（スクレイパー・cron route・マイグレーション等）は変更しない。型定義の修正のみ
- 曖昧な箇所があれば末尾に質問として列挙する。推測しない

完了時:
- 修正内容を要約する
- Owner への未解決の質問があれば記載する

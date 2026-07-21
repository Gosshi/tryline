`/specs/feat-match-scorer-player-links.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- GPT-5.6によるデザイン監査（2026-07-20）で判明: 試合詳細ページの得点経過セクション（`components/match-events-section.tsx`）の選手名がプレーンテキストのままで、選手ページへのリンクがない
- 出場選手一覧（`components/match-lineups-section.tsx`）は既に `playerSlug`（`lib/db/queries/match-lineups.ts` の `MatchLineupPlayer`型）でリンク済み。一方 `match_events`（`lib/db/queries/match-events.ts` の `MatchEventRow`型）は `playerName` のみでリンク先を持たない
- 選手名の名寄せ（表記ゆれ対応）は `lib/stats/player-stats.ts` の `playerNamesLikelyMatch` が既に実装・本番実績あり（`feat-recap-player-stat-verification.md` で使用中）。本specはこれを流用する。新しい全体名寄せロジックやDBスキーマ変更は行わない

やること:
- `app/matches/[id]/page.tsx` が既に取得している `MatchEventRow[]` と `MatchLineupPlayer[]` を突き合わせ、「イベントの `playerName` が、同じ試合・同じ `teamId` の出場選手のいずれかと `playerNamesLikelyMatch` で一致するか」を判定するヘルパー関数を新規作成する（例: `lib/format/match-event-player-links.ts`）
- 一致する場合のみ `components/match-events-section.tsx` の選手名表示を `/players/[slug]` へのリンクに変える。一致しない場合は従来通りプレーンテキスト表示のまま
- 照合は同じ試合・同じチームのロースターに限定する（他チームの同姓同名選手を誤って候補にしない）

処理すべきエッジケース:
- `match_lineups` が0件の試合でエラーにならないこと（従来通り未リンク表示）
- 表記ゆれで一致しない場合はプレーンテキストのまま表示され、リンク切れが発生しないこと
- 別チームの同姓同名選手に誤ってリンクされないこと

完了の定義:
- specの受け入れ条件1〜6を満たす
- `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean
- 変更ファイル一覧を報告する

要件:
- レビュー/プレビュー本文（LLM生成の自由文）中の選手名リンク化は対象外（別途検討）
- MOM表示のリンク化は対象外
- `match_events` テーブルへのカラム追加等のスキーマ変更はしない
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する

完了時:
- 実装内容・変更ファイルを要約する
- 得点経過セクションの変更前後のスクリーンショットを添付する
- 仕様書からの逸脱があれば理由を明示する
- 未解決の質問があれば記載する

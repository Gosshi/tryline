# feat-match-scorer-player-links

## 背景

GPT-5.6によるデザイン監査（2026-07-20）で判明: 試合詳細ページの得点経過セクション（`components/match-events-section.tsx`）に表示される選手名（例: Pollard、Mo'unga）がプレーンテキストのままで、選手ページ（`/players/[slug]`）へのリンクがない。「試合→選手」はデータ上の関係が最も強い場面のひとつだが、現状は繋がっていない。

一方、出場選手一覧（`components/match-lineups-section.tsx`）は同じ試合の `MatchLineupPlayer`（`lib/db/queries/match-lineups.ts`）が持つ `playerSlug` を使って既にリンク済み。`match_events`（`lib/db/queries/match-events.ts` の `MatchEventRow`）は `playerName`（`metadata.player_name` 由来のフリーテキスト）のみを保持し `playerSlug` を持たないため、得点イベント側は未リンクのまま残っている。

選手名の名寄せ（表記ゆれ・カタカナ/ローマ字混在）は `lib/stats/player-stats.ts` の `playerNamesLikelyMatch` が既に実装・本番実績あり（`feat-recap-player-stat-verification.md` で選手別統計の照合に使用、`fix-qa-player-stat-script-mismatch.md` で表記ゆれの偽陽性を修正済み）。本specはこの既存ユーティリティを流用し、**新しいDBカラム・新しい全体名寄せロジックを追加せず**、同じ試合の出場選手一覧という閉じた集合の中でのみ名前を照合することで、無関係な同姓同名選手への誤リンクリスクを避ける。

## スコープ

対象:
- `app/matches/[id]/page.tsx` で `MatchEventRow[]`（得点イベント）と `MatchLineupPlayer[]`（出場選手一覧、`playerSlug`保持）の両方が既に取得されていることを確認し、両者を突き合わせて「イベントの `playerName` が、同じ試合の同じチームの出場選手のいずれかと `playerNamesLikelyMatch` で一致するか」を判定するヘルパー関数を追加する（新規ファイル、例: `lib/format/match-event-player-links.ts`）
- 一致した場合、`components/match-events-section.tsx` の当該選手名表示を `/players/[slug]` へのリンクにする
- 一致しない場合（ラインアップに該当選手がいない、表記ゆれで一致しない等）は、従来通りプレーンテキストのまま表示する（リンクできないことをエラーにしない）
- 照合は**同じ試合・同じチーム**のロースターに限定する（イベントの `teamId` と一致するチームの出場選手のみを候補にする。他チームの同姓同名選手を誤って候補にしない）

対象外:
- レビュー/プレビュー本文（LLM生成のMarkdown自由文）中の選手名の自動リンク化。これは構造化データではなく自由文からの固有名詞抽出が必要になり、誤リンクリスク・実装難度が本specとは別水準のため対象外とする
- Man of the Match（MOM）表示のリンク化。MOMは現状LLM生成テキスト内の言及であり構造化フィールドを持たないため対象外（`project_mom_data_gap` 参照）
- `match_events` テーブルへの `player_id` カラム追加等のスキーマ変更
- ラインアップが空の試合（`match_lineups` 0件）への対応。この場合は候補が存在しないため従来通り未リンクのままでよい

## データモデル変更

なし。既存の `match_events`・`match_lineups` の読み取りクエリをそのまま使う。

## UI サーフェス

- 参照: `components/match-lineups-section.tsx` の既存リンクパターン（`href={`/players/${player.playerSlug}`}`）
- `components/match-events-section.tsx` の選手名表示箇所（`primary.event.playerName` 等）を、一致時のみ `<Link>` に置き換える。見た目のスタイル変更は最小限（下線等、既存のリンクスタイルに揃える）とし、レイアウト崩れを起こさない

## 受け入れ条件

1. 得点イベントの選手名が、同じ試合・同じチームの出場選手一覧に `playerNamesLikelyMatch` で一致する場合、選手ページへのリンクになることを確認するテストがある
2. 一致しない場合（表記ゆれで不一致、ラインアップに存在しない）はプレーンテキストのまま表示され、リンク切れやエラーが発生しないことを確認するテストがある
3. 別チームの同姓同名選手には誤ってリンクされないことを確認するテストがある（同じ`teamId`のロースターのみを候補にする）
4. `match_lineups` が0件の試合でイベント表示がエラーにならないことを確認する
5. `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` が通る
6. 変更前後で得点イベントセクションの視覚的なレイアウトが崩れていないことをスクリーンショットで確認する

## 未解決の質問

- なし。実装中に `playerNamesLikelyMatch` の挙動で判断に迷うケースがあれば、既存の呼び出し元（`lib/db/queries/players.ts` の `getPlayerCareerStats`）の使い方を踏襲する

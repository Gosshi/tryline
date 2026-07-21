# fix-player-page-width-and-navigation

## 背景

GPT-5.6によるデザイン監査（2026-07-20）で判明: 選手ページ（`app/players/[slug]/page.tsx`）は `max-w-4xl`（896px）固定で、通算成績（横5カラムの数値）と直近30試合のリストを縦一列に並べる構成になっている。1920px幅では左右の余白が過大で、情報密度に対して幅が狭い。

さらに、ページは「出場試合」セクション（直近30件のリンクリスト）の直後で終わっており、末尾に次のアクションへの導線がない。所属チームへのリンクはページ冒頭のヘッダー内（`player.teamSlug` へのリンク）にのみ存在し、ページを最後まで読んだユーザーが戻る手段がない。試合詳細ページには既に同種の「次に見る」ブロック（`fix-match-detail-page-flow.md`、実装済み）があるが、選手ページには相当するものがない。

## スコープ

対象:
- `app/players/[slug]/page.tsx` の外側コンテナ幅を `max-w-4xl`（896px）から `max-w-5xl` 〜 `max-w-6xl`（1024〜1152px目安）へ拡張する
- 「通算成績」セクションの5項目（出場・トライ・コンバージョン・PG・獲得ポイント）のカードを、拡張後の幅を活かして横並びの視認性を上げる（現状の `grid-cols-2 sm:grid-cols-5` を、拡張幅でも詰まって見えないよう調整する）
- ページ末尾（「出場試合」セクションの後）に「次に見る」ブロックを追加する。含める内容:
  - 所属チームへのリンク（`player.teamSlug`、既存の`/teams/[slug]`）
  - 所属チームの次戦（`getNextMatchesForTeams`、`lib/db/queries/matches.ts:1216`を再利用。`PlayerDetail`型の選手取得クエリ（`lib/db/queries/players.ts:428`）の`team:teams!players_team_id_fkey(...)` select句に`id`を追加し、`teamId`を取得できるようにする。これは既存selectへの1フィールド追加であり新規クエリの作成ではない）
  - 同チームの他の選手（`components/team-players-section.tsx` と同様のロースター取得を再利用し、当該選手を除いた同チーム選手を数名表示。「同ポジション」の絞り込みは`player.position`が一致するものを優先表示する形でよい）

対象外:
- `feat-team-player-visual-identity.md` で実装済みの `PlayerAvatar`・カラーウォッシュの変更
- 通算成績の集計ロジック自体の変更（`getPlayerCareerStats`）
- チームページ（`/teams/[slug]`）・H2Hページの幅変更
- 選手の実写真・実在ユニフォーム表現の追加

## データモデル変更

なし。既存テーブルの読み取りに限定する。`lib/db/queries/players.ts` の選手取得クエリのselect句に `team` の `id` フィールドを追加する変更のみ（新規カラム・新規テーブルなし）。

## API サーフェス

新規HTTP APIなし。既存クエリの再利用:
- `lib/db/queries/matches.ts` の `getNextMatchesForTeams({ afterIso, excludeMatchId, teamIds })`（`excludeMatchId`は該当なしのため空文字列またはこの用途に合わせた呼び出し方をCodexが判断してよい。既存の呼び出し元 `app/matches/[id]/page.tsx:342` を参考にする）
- 同チーム選手一覧は `components/team-players-section.tsx` が使っているクエリ・データ取得パターンを踏襲する（新規クエリを書く場合も同等のフィルタ条件に限定する）

## UI サーフェス

- 参照: `app/matches/[id]/page.tsx` の「次に見る」ブロック（`fix-match-detail-page-flow.md` 実装済み）の構成パターンを踏襲する
- 使用トークン: 既存の `--color-accent` / `--color-ink` / `--color-ink-muted` 等、選手ページ内の既存トークンをそのまま使う
- **完了の定義にビジュアル確認を含める**: 実装後、Owner が1440px・1920px・375pxで確認し、通算成績カードの詰まり・末尾ブロックの見た目を承認する

## 受け入れ条件

1. `app/players/[slug]/page.tsx` の外側コンテナが `max-w-5xl` 〜 `max-w-6xl` に拡張されていること
2. 「出場試合」セクションの後に「次に見る」ブロックがあり、所属チームリンク・所属チームの次戦・同チームの他選手（数名）が表示されること
3. 所属チームの次戦が存在しない場合（未定）、試合詳細ページの「次戦は未定です」と同様の表現でエラーにならず表示されること
4. 同チームに他の選手が存在しない場合、「次に見る」ブロックの当該項目が非表示になり、レイアウトが崩れないこと
5. 375px幅でオーバーフロー・横スクロールが発生しないこと
6. `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` が通る
7. Owner による1440px・1920px・375pxのスクリーンショット目視確認で承認を得ること

## 未解決の質問

- 「同チームの他の選手」の表示件数・並び順（同ポジション優先か、ジャージ番号順か等）は実装時にCodexが妥当な形で判断してよい。Owner確認時に調整可能

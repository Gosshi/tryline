`/specs/fix-player-page-width-and-navigation.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- GPT-5.6によるデザイン監査（2026-07-20）で判明: 選手ページ（`app/players/[slug]/page.tsx`）は `max-w-4xl`（896px）固定で、1920px幅では余白が過大。かつ「出場試合」セクションの直後でページが終わり、末尾に次のアクションへの導線がない
- 試合詳細ページには既に「次に見る」ブロック（`fix-match-detail-page-flow.md`、マージ済み）があるが、選手ページには相当するものがない
- `feat-team-player-visual-identity.md`（マージ済み）は `PlayerAvatar` 等の視覚要素のみを扱っており、幅・末尾導線は対象外だった

やること:
- `app/players/[slug]/page.tsx` の外側コンテナ幅を `max-w-4xl` から `max-w-5xl` 〜 `max-w-6xl`（1024〜1152px目安）へ拡張する
- 「通算成績」セクション（出場・トライ・コンバージョン・PG・獲得ポイントの5項目）を拡張後の幅で見やすく調整する
- ページ末尾（「出場試合」セクションの後）に「次に見る」ブロックを追加する:
  - 所属チームへのリンク（`player.teamSlug`）
  - 所属チームの次戦（`lib/db/queries/matches.ts:1216` の `getNextMatchesForTeams` を再利用。そのために `lib/db/queries/players.ts:428` の選手取得クエリの `team:teams!players_team_id_fkey(...)` select句に `id` を追加し `teamId` を取得できるようにする。新規クエリではなく既存selectへの1フィールド追加に留める）
  - 同チームの他の選手数名（`components/team-players-section.tsx` のデータ取得パターンを踏襲）

処理すべきエッジケース:
- 所属チームの次戦が未定の場合、試合詳細ページの「次戦は未定です」と同様の表現で対応する
- 同チームに他の選手がいない場合、その項目を非表示にしてレイアウトを崩さない
- 375px幅でオーバーフロー・横スクロールが発生しないこと

完了の定義:
- specの受け入れ条件1〜7を満たす（7番目のOwner目視確認は、実装後にスクリーンショットを添えて報告し、Owner確認を待つ形でよい）
- `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean
- 変更ファイル一覧を報告する

要件:
- `feat-team-player-visual-identity.md` で実装済みの `PlayerAvatar`・カラーウォッシュは変更しない
- `getPlayerCareerStats` の集計ロジック自体は変更しない
- チームページ・H2Hページの幅は対象外
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する

完了時:
- 実装内容・変更ファイルを要約する
- 1440px・1920px・375pxのスクリーンショットを添付する
- 仕様書からの逸脱があれば理由を明示する
- 未解決の質問があれば記載する

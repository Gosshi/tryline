`specs/feat-calendar-internal-linking.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- 過去の判断は `docs/decisions.md` を読む
- 背景: GA4 実測で `/calendar` は全ページ中で最長の滞在（120秒）なのに11セッションしかなく、最も流入のある大会ハブ（71セッション・107秒）から `/calendar` へのリンクが1本も無い。逆にカレンダーからは大会ハブへのリンクが無く、3.6秒しか滞在されない試合詳細にだけ人を送っている。**滞在の長いページ同士を双方向に繋ぐのが本 spec の目的**
- **DB クエリの追加は不要**。リンク生成に必要な `family` / `season` は `CalendarMatch.competition`（`lib/db/queries/matches.ts:108-123`）に既に含まれている
- **大会ハブの URL は `/c/{family}/{season}`。`slug` を第1セグメントに使わない。** `app/c/[competition]/[season]/page.tsx:325` が `getCompetitionBySlug(\`${competition}-${season}\`)` を呼ぶ通り、ルート第1セグメントは `competitions.family` で、`slug` は `{family}-{season}` の完全 slug（例 `nations-championship-2026`）。`slug` を使うと `/c/nations-championship-2026/2026` になり 404 する。本番 `competitions` 37件すべてで `slug = family || '-' || season` が成立し、`family` / `season` に NULL・空文字は無いことを確認済み（2026-08-10 実測）

参考にする既存パターン:
- **セクション末尾のリンクの見た目と配置**: `app/c/[competition]/[season]/page.tsx:697-703` の「順位表をすべて見る →」。日程セクション末尾に足すリンクはこれに揃える
- **計測付きリンク**: `components/tracked-link.tsx` の `TrackedLink` と `lib/analytics.ts:6-15` の `CtaClickParams`。使用例は `app/page.tsx:295-310`（`home_hero_calendar`）
- **既存の `cta_id` の命名**: `site_header_pricing` / `home_hero_calendar` / `home_focus_calendar` などに倣う。spec の計測表の値をそのまま使う
- **カード内で外側 `<Link>` の兄弟として置くパターン**: `components/calendar/week-schedule.tsx:185-195` の「視聴」チップ。大会ハブへのリンクもこの構造にする
- **ヒーローの CTA 行**: `app/c/[competition]/[season]/page.tsx:580-593`

エッジケース:
- **アンカーの入れ子を作らないこと。** `week-schedule.tsx:112-115` でカード全体が既に `<Link href={/matches/${match.id}}>` になっている。大会ハブへのリンクをこの内側に置くと不正な HTML になり、Next.js の hydration も壊れる。必ず外側 `<Link>` の兄弟にする
- `WeekSchedule` は `compact` プロップ付きでトップページ（`components/home-matchday-board.tsx`）からも使われる。**両方の見た目を確認する**
- カレンダーの「大会別に見る」は、その週の `matches` に**実際に含まれる大会だけ**を重複排除して出す。全大会を並べない。重複排除のキーは `family` + `season`（リンク先 URL と1対1）。同一 family でもシーズンが違えば別ハブなのでまとめない
- 試合が1件も無い週では「大会別に見る」ブロック自体を出さない（空の見出しだけが残らないこと）
- 大会名の表示は既存の `formatCompetitionTitle`（`week-schedule.tsx:119-122`）を使い続ける。表記を作り直さない
- **ヒーローは既存2つ（「この大会を購読」「大会iCal URL」）をそのまま残し、3本目として `/calendar` を足す。** 3本目はピルにしない。同じ形のピルが3つ並ぶと階層が消えるため、矢印付きのテキストリンクにする。既存の `flex flex-wrap gap-2` で折り返したときも読めること
- `components/site-header.tsx:45-52` の「カレンダー」を `TrackedLink` にする際、ヘッダーが Server / Client のどちらから描画されているかを確認する。`TrackedLink` は `"use client"` なので、必要なら境界を確認してから差し替える

やらないこと:
- トップページ（`app/page.tsx`）のカレンダー導線の変更。既に2本あり計測済み
- iCal フィードの生成・エンドポイント・URL の変更（`app/api/calendar/**` は触らない）
- **ヒーローの既存 CTA 2つ（「この大会を購読」「大会iCal URL」）に手を入れること。** 外す・順序を変える・スタイルを変える・ラベルを変える、いずれも不可。足すだけ
- カレンダーページの週送り UI・レイアウトの作り替え
- 試合詳細（`/matches/{id}`）への既存リンクの削除
- 大会ハブのページ内ナビ（`613-638` の `#schedule` / `#standings` / `#guide`）への項目追加。ページ内アンカーと外部遷移を混在させない
- 新しい DB クエリ・新しいテーブルアクセスの追加
- モバイルアプリ（`tryline-mobile`）側の変更

完了の定義:
- spec の受け入れ条件1〜12をすべて満たす
- テストを追加する。最低限、**アンカーの入れ子が無いこと**（受け入れ条件6）と、**試合が無い週に「大会別に見る」が出ないこと**（受け入れ条件7）の2ケース
- `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` clean
- 変更ファイル一覧を報告する

完了時:
- 実装内容を要約する
- **スクリーンショットを4枚添える**: `/c/nations-championship/2026` のヒーロー、同ページの日程セクション末尾、`/calendar` の上部（大会別に見る）、トップページの `compact` な週間スケジュール
- spec の受け入れ条件を1項目ずつ、満たしたことをどう確認したかと合わせて報告する（「CI green」だけの報告は不可）
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する

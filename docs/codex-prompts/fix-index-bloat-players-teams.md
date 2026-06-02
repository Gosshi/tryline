# Codex プロンプト: インデックス肥大の解消（選手 noindex / チームURL統合）

`specs/fix-index-bloat-players-teams.md` を実装してください。GSC 実測で、薄い選手ページがクロールバジェットを食い潰し価値資産の recap が未クロールになっている問題への対応です。

## コンテキスト
- まず `CLAUDE.md` の規約を読む。
- 設計は `docs/architecture.md`、過去判断は `docs/decisions.md`。
- 既存 SEO spec（`specs/fix-sitemap-content-only.md` / `specs/fix-seo-indexing.md`）が「player/team は対象外」と残した穴を埋める後続。これらと競合させない。
- 本タスクはクエリのフィルタ追加・metadata 追加・ルートのリダイレクトのみ。**データモデル変更なし**。

## 確定方針（仕様の「確定した方針」より）
1. **index 対象選手 = 実名 AND「コンテンツあり試合」に1回以上出場**。両方満たさない選手は noindex（ただしページ自体は表示継続・削除しない）。
2. **チーム canonical = `/teams/[slug]`**。`/t/[team]` は301で `/teams/[slug]` へ。
3. 選手ページは将来スタッツを乗せる含みがあるため `noindex,follow`（`nofollow` にしない）。判定は `isIndexablePlayer` に一元化し、将来1箇所で緩和できる形にする。

## 参考にする既存パターン（これらに倣う）
- **選手クエリ** `lib/db/queries/players.ts`
  - `listAllPlayerSlugs()`（L199-212、`canonical_player_id IS NULL` の全スラッグ）を温存しつつ、新規 `listIndexablePlayerSlugs()` を追加。
  - 「コンテンツあり試合」の母集合は `lib/db/queries/matches.ts` の `listMatchIdsWithContent()`（`match_content.status='published'`）を再利用。
  - 選手↔出場記録の結合テーブルは、**選手ページが「出場試合」を表示している箇所のクエリ**（`app/players/[slug]/page.tsx` が呼ぶ取得関数）を参照元に特定する。
- **選手ページ metadata** `app/players/[slug]/page.tsx`
  - 既存の alias→canonical `redirect`（generateMetadata L44〜、L66-67）と同じ場所で、非 indexable 選手に `robots: { index: false, follow: true }` を付与。
  - 判定は `isIndexablePlayer(player)` ヘルパー（`lib/db/queries/players.ts` か `lib/seo` 等）に集約し、sitemap と page.tsx の両方から呼ぶ（DRY）。
- **sitemap** `app/sitemap.ts`
  - `playerPages`（L81-86）を `listIndexablePlayerSlugs()` ベースに差し替え。
  - `teamPages`（L75-80）の URL を `/t/${slug}` → `/teams/${slug}` に変更。
- **チームページ** `app/teams/[slug]/page.tsx`（canonical 側・169行）に `alternates.canonical` を明示。`app/t/[team]/page.tsx`（132行）を `permanentRedirect('/teams/<slug>')` に置き換え。
- 定数・整形: `SITE_URL`（`@/lib/site`）。canonical の書き方は `app/matches/[id]/page.tsx` の `alternates.canonical` を参照。

## 要件
- 仕様「受け入れ条件」1〜6 をすべて満たす（7 は Owner が GSC で後日確認する先行指標なので実装対象外）。
- 各変更にテストを書く: `listIndexablePlayerSlugs` の単体テスト（無名除外・出場ゼロ除外・実名かつ出場ありは含む）、`isIndexablePlayer` の判定テスト、`/t/` → `/teams/` リダイレクトのテスト。
- 曖昧点は推測せず末尾に質問として列挙する。

## 必ず処理すべきエッジケース
1. `player-<hash>`（氏名未解決）→ 常に noindex・sitemap 除外。
2. 実名だが「コンテンツあり試合」への出場が0件の選手 → noindex・sitemap 除外。
3. 実名かつ出場あり → **従来どおり index**（robots を付けない）。誤って全選手 noindex にしないこと。
4. alias 選手（`canonical_player_id` が非 null）は既に sitemap 除外済み・canonical へ redirect 済み。挙動を壊さない。
5. `/t/[team]` → `/teams/[slug]` の301はループしないこと（`/teams/` 側は自身へリダイレクトしない）。存在しない team は従来どおり `notFound()`。
6. **内部リンクの `/t/` 参照を全て `/teams/` に置換**。`href="/t/`・テンプレートリテラル `/t/${...}`・`Link` コンポーネントを grep し、ヘッダー/フッター/試合ページ/選手ページ/チームカード等の漏れを無くす。置換後に `/t/` への内部リンクが残っていないこと。
7. 選手ページは noindex でも**ユーザーには通常表示**（200・本文あり）。削除・404 にしない。`follow` を維持し試合ページへの PageRank を流す。
8. 既存の match/round/h2h/season/family の sitemap エントリを壊さない。

## 完了の定義
- `lib/db/queries/players.ts` に `listIndexablePlayerSlugs()` と `isIndexablePlayer()` を追加（`listAllPlayerSlugs` は壊さない or 用途がなければ整理）。
- `app/players/[slug]/page.tsx` が非 indexable 選手に `noindex,follow` を返す。
- `app/sitemap.ts`: player は indexable のみ、team は `/teams/` 形式。
- `app/t/[team]/page.tsx` が `/teams/[slug]` へ301。`app/teams/[slug]/page.tsx` に canonical 明示。
- 内部リンクが全て `/teams/` に統一。
- `pnpm typecheck`・`pnpm build`・`pnpm test`（既存含む全件）グリーン。
- 実装内容・変更ファイル・仕様からの逸脱理由・Owner への未解決質問を末尾に要約。

## 完了時に報告してほしいこと
- sitemap の総 URL 数（変更前→後）と、除外した選手数・残した indexable 選手数。
- 「コンテンツあり試合への出場」判定に使った結合テーブル名とクエリ概要。
- `/t/` から `/teams/` へ置換した内部リンク箇所の一覧。
- 非 indexable 選手ページが `noindex,follow` を返すことの確認方法（実際の HTML 抜粋 or テスト）。

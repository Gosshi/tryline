# Codex プロンプト: ラウンドハブページ（S4 / Part A）

`specs/feat-discovery-pages-round-h2h.md` の **Part A（ラウンドハブページ）のみ** を実装してください。Part B（H2H）は別プロンプトで後続するので**本タスクでは実装しない**。

## コンテキスト
- まず `CLAUDE.md` の規約を読む。
- 設計は `docs/architecture.md`、過去判断は `docs/decisions.md`。
- `/lib` と `/app` の既存パターンに従う。本タスクは新規ルート＋クエリのみで、データモデル変更なし。

## 参考にする既存パターン（これらに倣う）
- **シーズンページ** `app/c/[competition]/[season]/page.tsx`
  - `generateStaticParams`（L33 付近）、`generateMetadata`（L75 付近）、`BreadcrumbList` JSON-LD（L139 付近）の書き方をそのまま踏襲する。
- **クエリ層** `lib/db/queries/matches.ts`
  - 既存 `MatchListItem` 型（`round: number | null` を持つ、L7/L16）と `mapMatchRow`（L235）、`getRoundFromExternalIds`（L263）を再利用。
  - ここに新規クエリ `getRoundMatches(competitionSlug, season, round)` と「(competition, season) ごとの数値ラウンド一覧」を返すクエリを追加する。
- **試合カード** `components/match-card.tsx` を試合行に流用。
- **ラウンド見出し** `components/round-heading.tsx` / `components/season-match-groups.tsx`（`?round=` クライアントフィルタを持つ）。シーズンページの各ラウンド見出しから対応ハブへのリンクを足す。
- **sitemap** `app/sitemap.ts` の `seasonPages` 構築パターンに倣ってラウンドハブ URL を追加。
- 定数・整形: `SITE_URL`（`@/lib/site`）、`formatCompetitionTitle`/`formatFamilyName`（`@/lib/format/competition`）。

## 要件
- 仕様 Part A の「A.6 受け入れ条件」をすべて満たす。
- スコープ外（Part B / チームページ / ノックアウトの roundName ハブ）は実装しない。
- 各受け入れ条件に対応するテストを書く（新規クエリの単体テスト、round=null 除外、notFound 系）。
- 曖昧点は推測せず末尾に質問として列挙する。

## 必ず処理すべきエッジケース
1. `round` が null の試合（ノックアウト等、`roundName` のみ）は**ハブ生成対象外**。`generateStaticParams` の数値ラウンド一覧に含めない。
2. 存在しない competition / season / round → `notFound()`（404）。
3. 対象ラウンドの試合が0件 → `notFound()`。
4. 数値ラウンドが1つも無い大会（カップ戦など）→ ハブを生成しない（エラーにしない）。
5. 前後ラウンドリンク（← 第N-1節 / 第N+1節 →）は**実在するラウンドのみ**表示。端のラウンドでは欠ける側を出さない。
6. 初期 HTML に各試合の `<a href="/matches/...">` が含まれること（折りたたみなし＝内部リンクを Google がたどれる）。
7. シーズンページの既存 `?round=` クライアントフィルタは壊さない。重複コンテンツ回避のため canonical は**パス版**（`/c/.../round/N`）を正とする。

## 完了の定義
- 新規ルート `app/c/[competition]/[season]/round/[round]/page.tsx` が動作。
- `lib/db/queries/matches.ts` に新規クエリ追加（既存 `listAllMatchIds`/`listMatchIdsWithContent` は壊さない）。
- シーズンページのラウンド見出し→ハブのリンク追加。
- `app/sitemap.ts` に数値ラウンドのハブ URL を追加。
- `pnpm typecheck`・`pnpm build`・`pnpm test`（既存含む全件）グリーン。
- 実装内容・変更ファイル・仕様からの逸脱理由・Owner への未解決質問を末尾に要約。

## 完了時に報告してほしいこと
- 生成されるラウンドハブのおおよその URL 件数（sitemap 影響の把握）。
- `getRoundMatches` の重複排除・並び順（節内の試合表示順）をどう決めたか。

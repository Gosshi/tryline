# Codex 指示書: ビルド時間の短縮（プリレンダー対象の絞り込みと検証のCI一本化）

仕様: `specs/fix-build-time-prerender-scope.md`（権威。ここに書いていない判断はすべて仕様書に従う）

## やること

本番デプロイ5分48秒のうち249秒（72%）を占める静的ページ生成を減らす。1564ページのうち約1,100ページは `revalidate` 付きの ISR ルートで、ビルド時にプリレンダーしなくてもオンデマンド生成される。あわせて `next build` 内の Lint・型チェック（50秒）を CI へ寄せる。

## 絶対に壊してはいけないもの

**`app/sitemap.ts` の出力を1URLも変えない。**

`listMatchIdsWithContent` と `listRoundHubParams` は sitemap と `generateStaticParams` の**両方**から呼ばれている（`app/sitemap.ts:32`・`:34`）。**既存関数に期間フィルタを足すと sitemap が縮み、インデックス済みURLが sitemap から消える。** 新しい関数を追加して `generateStaticParams` 側だけ差し替えること。

`lib/db/queries/matches.ts:180` の `SitemapMatch` は `kickoff_at` を持たず、`listMatchIdsWithContent` は `match_content` 起点で `generated_at` 降順に取得している。新関数では `matches.kickoff_at` を select して絞り込む必要がある。

## 変更するファイル

- `lib/db/queries/matches.ts` — `PRERENDER_MATCH_WINDOW_DAYS = 90` / `PRERENDER_ROUND_WINDOW_DAYS = 120` と、`listPrerenderMatchIds()` / `listPrerenderRoundHubParams()` を追加（シグネチャは仕様書の「API サーフェス」節のとおり）
- `app/matches/[id]/page.tsx:68` — `listMatchIdsWithContent()` → `listPrerenderMatchIds()`
- `app/matches/[id]/en/page.tsx:41-42` — `listPrerenderMatchIds()` を `competitionFamily === "league-one"` で絞る形に置き換え、`listAllMatchIds` の呼び出しを削除
- `app/c/[competition]/[season]/round/[round]/page.tsx:40` — `listRoundHubParams()` → `listPrerenderRoundHubParams()`
- `next.config.ts` — `eslint: { ignoreDuringBuilds: true }` と `typescript: { ignoreBuildErrors: true }` を追加
- `.github/workflows/ci.yml` — `on` に `push: branches: [main]` を追加（`validate` ジョブの中身は触らない）
- テスト（下記）

**`app/sitemap.ts`・`app/h2h/[pair]/page.tsx`・`app/c/[competition]/[season]/page.tsx`・`app/c/[competition]/[season]/standings/page.tsx` は変更しない。**

## テストの置き場所

`vitest.config.ts` は `tests/db/**/*.test.ts` を既定実行から**除外**している。新しいクエリのテストをそこに置くと `pnpm test` で走らない。既存の慣習に合わせ、クエリのテストは `tests/db-queries-*.test.ts`（リポジトリ直下の `tests/`）、ページとsitemapのテストは `tests/app/`、ワークフローのテストは `tests/workflows/` に置くこと。

## 完了の定義

仕様書の受け入れ条件1〜11をすべて満たすこと。特に次の2点を省略しない。

1. **受け入れ条件4の意図的破壊確認**: sitemap のテストが「sitemap の呼び出しを `listPrerenderMatchIds` に差し替えると落ちる」ことを実際に確かめ、その結果を PR 本文に書く。通るが検出しないテストを防ぐため。
2. **受け入れ条件9・10の実測引用**: PR のプレビュービルドログから `Generating static pages (N/N)` の行と `Build Completed in /vercel/output [Xm]` の行を PR 本文に引用する。`pnpm build` は隔離クローンでは環境変数が無く動かないので、ここはプレビューデプロイのログが唯一の根拠になる。

## 検証コマンド

```
pnpm typecheck
pnpm lint
pnpm test
```

`pnpm test` のテスト総数が 308 files / 1,895 tests から減っていないことを PR 本文に書くこと。

## 依存

追加パッケージなし。マイグレーションなし。本番DBへの書き込みなし。

# ビルド時間の短縮（プリレンダー対象の絞り込みと検証のCI一本化）

## 背景

本番デプロイに 5分48秒 かかっている。PR #839 の本番デプロイ（`dpl_5oYWwMGgiGeGCJtRzmgjWqsKW7qJ`）のビルドログを実測した内訳は次のとおり。

| 段階 | 時間 |
|---|---:|
| clone・キャッシュ復元・install | 8秒 |
| コンパイル | 10秒 |
| Lint と型チェック（`next build` 内） | 50秒 |
| Collecting page data | 9秒 |
| **静的ページ生成 1564ページ** | **249秒（全体の72%）** |
| Finalize・deploy | 18秒 |

1564ページの内訳は 試合888 ／ 試合/en 143 ／ h2h 200 ／ ラウンド203 ／ 大会ハブ37 ／ 順位表17 ／ DB非依存76 で、1ページあたり約159ms。

**これらのページはすべて `revalidate` 15分〜1時間の ISR 設定を持ち、`dynamicParams` はどのルートにも設定が無い（＝既定の `true`）。** つまりビルド時にプリレンダーしなくても初回リクエストで生成されてキャッシュされる。Vercel 公式も「人気ページだけビルド時にプリレンダーし、残りはオンデマンドにするとビルドが速くなる」を推奨構成として明記している（[ISR docs](https://vercel.com/docs/incremental-static-regeneration) の "Selective pre-rendering"）。

公開コンテンツを持つ888試合のキックオフ分布は偏っており、**過去30日以内はわずか24試合、90日以内で52試合**（本番実測、2026-09-16）。境界を30日から90日に広げてもビルド時間はほぼ変わらない。

Lint と型チェックの50秒は CI（`pnpm lint` / `pnpm typecheck`）と完全に重複している。ただし **CI は `pull_request` でしか走らず main では一度も走らない**ため、`next build` から外すだけだと main の検証がゼロになる。両者は同じ PR で行う。

## スコープ

**対象:**
- `lib/db/queries/matches.ts` — プリレンダー専用のクエリ関数を新規追加
- `app/matches/[id]/page.tsx` / `app/matches/[id]/en/page.tsx` / `app/c/[competition]/[season]/round/[round]/page.tsx` — `generateStaticParams` の参照先差し替え
- `next.config.ts` — `next build` 内の Lint・型チェックを無効化
- `.github/workflows/ci.yml` — main への push で CI を実行

**対象外:**
- `app/sitemap.ts` の出力（**1URLたりとも変えない**。[[specs/fix-sitemap-content-only.md]] で確立したコンテンツあり試合のみの方針を維持する）
- h2h（200件）、大会ハブ（37件）、順位表（17件）のプリレンダー対象
- `revalidate` の値、`dynamicParams` の設定追加、UI、データモデル
- 既存 `listMatchIdsWithContent` / `listRoundHubParams` / `listHeadToHeadPairs` / `listStandingsPageParams` の戻り値と副作用

## 実装上の制約（必ず守る）

**`listMatchIdsWithContent`・`listRoundHubParams` は `app/sitemap.ts` と `generateStaticParams` の両方から呼ばれている**（`app/sitemap.ts:32` と `:34`、`app/matches/[id]/page.tsx:68`、`app/matches/[id]/en/page.tsx:41`、`app/c/[competition]/[season]/round/[round]/page.tsx:40`）。

**これらの既存関数に期間フィルタを足してはならない。** 足すと sitemap から古い試合URLが消え、インデックス済みURLが sitemap から外れる。**新しい関数を追加し、`generateStaticParams` 側だけを差し替える。**

現行の `SitemapMatch` は `{ competitionFamily: string | null; id: string; updatedAt: string }` で **`kickoff_at` を持たない**（`lib/db/queries/matches.ts:180`）。`listMatchIdsWithContent` は `match_content` を起点に `generated_at` 降順で取得しており、キックオフ日時を select していない。新関数では `matches.kickoff_at` を select して絞り込む。

## データモデル変更

なし。マイグレーション不要。読み取りのみ。

## API サーフェス

`lib/db/queries/matches.ts` に追加する。既存 export は変更しない。

```
export const PRERENDER_MATCH_WINDOW_DAYS = 90;
export const PRERENDER_ROUND_WINDOW_DAYS = 120;

export async function listPrerenderMatchIds(): Promise<SitemapMatch[]>
export async function listPrerenderRoundHubParams(): Promise<RoundHubParam[]>
```

- `listPrerenderMatchIds` — `status = "published"` の `match_content` を持ち、かつ `matches.kickoff_at >= now - PRERENDER_MATCH_WINDOW_DAYS 日` の試合。戻り値の型・重複排除の挙動は `listMatchIdsWithContent` と同一にする（`competitionFamily` は同じ導出、`updatedAt` は同じ値）。未来のキックオフは常に含む。
- `listPrerenderRoundHubParams` — `listRoundHubParams` と同じキー構成（`competition` / `round` / `season` / `updatedAt`）で、**そのラウンドの最新キックオフが `now - PRERENDER_ROUND_WINDOW_DAYS 日` 以降のものだけ**を返す。
- 日数は定数から算出し、呼び出し側にマジックナンバーを置かない。

差し替え箇所:

| ファイル | 変更前 | 変更後 |
|---|---|---|
| `app/matches/[id]/page.tsx:68` | `listMatchIdsWithContent()` | `listPrerenderMatchIds()` |
| `app/matches/[id]/en/page.tsx:41-42` | `listMatchIdsWithContent()` と `listAllMatchIds()` の積集合 | `listPrerenderMatchIds()` を `competitionFamily === "league-one"` で絞る（`listAllMatchIds` の呼び出しは不要になる） |
| `app/c/[competition]/[season]/round/[round]/page.tsx:40` | `listRoundHubParams()` | `listPrerenderRoundHubParams()` |
| `app/sitemap.ts` | — | **変更しない** |

## ビルド設定

`next.config.ts`（現在71行、`eslint` / `typescript` キーは未設定）に追加する。

```
eslint: { ignoreDuringBuilds: true },
typescript: { ignoreBuildErrors: true },
```

`.github/workflows/ci.yml` の trigger を次のようにする。既存の `validate` ジョブの中身は変更しない。

```
on:
  pull_request:
    branches:
      - main
  push:
    branches:
      - main
```

## UI サーフェス

変更なし。表示・URL・メタデータ・sitemap の出力はすべて現状維持。

## LLM 連携

なし。決定論的なビルド設定とDB読み取りのみで、LLM 呼び出しもプロンプト変更も発生しない。**LLM費用の増減はゼロ。** DB 読み取りはビルド時のクエリが減る方向。

## 受け入れ条件

検証は `pnpm exec vitest run <該当ファイル>` と、PR の Vercel プレビュービルドログで行う。**`pnpm build` は隔離クローンでは環境変数が無く実行できないため、ビルド関連の確認はプレビューデプロイのログを根拠にする。**

1. `listPrerenderMatchIds` が、キックオフ10日前・未来の試合を**含み**、100日前の試合を**含まない**（3件のフィクスチャで確認）。
2. `listPrerenderMatchIds` が返す各要素の `competitionFamily` と `updatedAt` が、同じ試合について `listMatchIdsWithContent` の返す値と一致する。
3. **`listMatchIdsWithContent` の返却件数と内容が本変更前後で変わらない。** 100日前の試合を含むフィクスチャで、同関数が引き続きその試合を返すことを assert する。
4. **`app/sitemap.ts` の出力が変わらない。** 100日前のコンテンツあり試合の URL が sitemap に含まれることを assert するテストを `tests/app/` 配下に置く。**このテストは、sitemap の呼び出しを `listPrerenderMatchIds` に差し替えると落ちること**を実際に確認した上で提出する（通るが検出しないテストを防ぐため）。
5. `listPrerenderRoundHubParams` が、最新キックオフ200日前のラウンドを除外し、30日前のラウンドを含む。同じフィクスチャで `listRoundHubParams` は両方を返し続ける。
6. `app/matches/[id]/en/page.tsx` の `generateStaticParams` が、`league-one` かつ90日以内の試合だけを返す。league-one 以外の90日以内の試合、および league-one の100日前の試合は返さない。
7. `.github/workflows/ci.yml` が main への push で起動することを検証するテストを `tests/workflows/` 配下に追加する（既存の `tests/workflows/cron-ingest-top14-match-events.test.ts` と同じ形式）。`pull_request` トリガーが残っていることも同時に assert する。
8. `next.config.ts` に `eslint.ignoreDuringBuilds` と `typescript.ignoreBuildErrors` が `true` で設定されている。
9. **PR のプレビュービルドログで `Generating static pages` の総数が 600 未満**（現在1564）。PR 本文にその行を引用する。
10. **プレビューデプロイの所要時間が3分未満**。Vercel のビルドログ末尾 `Build Completed in /vercel/output [Xm]` を PR 本文に引用する。
11. `pnpm typecheck` / `pnpm lint` / `pnpm test` が通る。テスト総数が現在の 308 files / 1,895 tests から**減っていない**。

## リスクと運用上の変化（Owner 向け）

**ISR キャッシュはデプロイごとに独立している。** Vercel 公式の記述は次のとおり。

> The ISR cache lives alongside your Function region and persists content for 31 days, or until you revalidate it. It is scoped to a specific deployment where each deployment generates its own cache.
> ... each new deployment uses its own ISR cache and does not reuse the cache from a previous deployment.

つまり **デプロイのたびに、プリレンダーを外した約1,100ページは「最初に踏んだ1人だけ」サーバ生成を待つ**（以後はキャッシュ）。同一パスへの同時リクエストは Vercel 側で1回の関数実行にまとめられる（request collapsing）ため、スパイクで増殖はしない。ロールバック時も過去デプロイのキャッシュは消えない。

- 課金は ISR の読み取り・書き込み・関数実行が増える方向。ただし**実際にアクセスされたページしか生成されない**ため、古い試合ページへの流入が少ない現状では増分は小さいと見込む。デプロイ後に Vercel の使用量で確認する。
- 存在しない ID でのアクセスは 404 のまま（`app/matches/[id]/page.tsx:199` ほか4ルートすべてに `notFound()` が実在することを確認済み）。`dynamicParams` を既定 `true` のままにしても、インデックス対象のゴミページは発生しない。
- sitemap は全コンテンツを載せ続けるため、検索エンジンの発見性は変わらない。

## 未解決の質問

なし。以下は 2026-09-16 に Owner が決定済みで、`docs/decisions.md` の **D034** に記録した。

1. 期間は **試合90日・ラウンド120日**で確定。
2. **h2h の200件は据え置く。** 絞り込み後は h2h が最大の塊（約200／430ページ）になるが、検索流入があるため削らない。
3. `next build` から Lint・型チェックを外す変更と、main への push CI 追加は、**同じ PR で行う（別 PR に分けない）**。

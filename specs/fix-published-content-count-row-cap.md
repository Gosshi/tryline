# 大会ごとの公開記事数が 1000 行で切れる／ホームの「レビュー◯本」がプレビューを含む

## 背景

### 1. 公開記事数の集計が 1000 行上限に掛かっている

`listSeasonsByFamily`（`lib/db/queries/competitions.ts:310`）と `listSeasonsByFamilies`（`:369`）は、
大会ごとの公開記事数 `publishedContentCount` を出すために `match_content` の published 行を**絞り込みも件数指定もなしで全件取りに行く**。

```ts
client
  .from("match_content")
  .select("matches!inner(competition_id)")
  .eq("status", "published")   // :320-323 と :387-390
```

PostgREST の既定上限は 1,000 行（`specs/fix-orchestrate-existing-content-row-cap.md:34`、#853 と同じ型）。
本番の published は **2026-09-23 時点で 1,012 行**あり、既に上限を超えている。並び順を指定していないので、**どの 12 行が落ちるかは不定**。

#### 今の実害と、これからの実害（2026-09-23 本番で確認）

- **今日の時点で表示の誤りは見つかっていない。** 14 大会の大会トップで「準備中」表示のシーズンは 6 つあったが、すべて DB 上も公開記事 0（`autumn-nations-2026`・`premiership-2026-27`・`rugby-championship-2026`・`rwc-2027`・`six-nations-2027`・`urc-2026-27`）
- ホームの注目大会カード（リポビタン D チャレンジカップ 2026）の件数も、今日は DB と一致した
- ただし公開記事は毎日増える。落ちる行が増えると、公開記事の少ないシーズン（`puma-trophy-2026` 4 本、`top-14-2024-25` 5 本、`lipovitan-challenge-cup-2026` 5 本など）が **0 と数えられて、大会トップの「全シーズン」でリンクの無い「準備中」になる**。ホームの注目大会カードの件数も少なく出る

`publishedContentCount` の消費先:

| 消費先 | 使い方 |
|---|---|
| `app/c/[competition]/page.tsx`（「全シーズン」一覧） | `> 0` ならリンク、0 なら「準備中」 |
| `app/page.tsx:216` → `components/featured-competition-card.tsx:67` | 「レビュー {n}本」として表示 |

`listSeasonsByFamily` はこのほか `app/sitemap.ts:41`（大会ごとに 1 回）・シーズンページの `generateStaticParams`・`app/api/v1/competitions/route.ts:13` からも呼ばれる。件数は使わないが、**呼ばれるたびに published 全行を取っている**。

### 2. ホームの「レビュー◯本」にプレビューが混ざっている

`publishedContentCount` は content_type も language も区別しない。ホームのカードはこれを「レビュー {n}本」と表示している。

2026-09-23 のホーム: 「レビュー **5本**」。DB の実数は `lipovitan-challenge-cup-2026` の published が **recap(ja) 2 本・preview(ja) 3 本**。**レビューは 2 本**。

## スコープ

対象:
- 公開記事数の集計を、対象の大会だけに絞り、1000 行を超えても全件数える形にする
- 集計を content_type 別に持ち、ホームのカードは日本語レビュー（recap × ja）の本数を出す

対象外:
- 大会トップ「全シーズン」の出し分け条件（`publishedContentCount > 0`）の意味の変更。**全種類の公開記事数のままにする**（プレビューだけのシーズンもリンクにしておく）
- `app/sitemap.ts`・`generateStaticParams`・API が件数を使わないのに集計を走らせている無駄の解消（別件。本 spec の絞り込みで 1 回あたりの量は減る）
- `components/featured-competition-card.tsx` のラベルやデザインの変更

## データモデル変更

なし。

## API サーフェス

### `CompetitionRow`（`lib/db/queries/competitions.ts:14`）

`publishedContentCount: number` はそのまま残し、次を追加する:

```ts
publishedRecapCount: number; // content_type = "recap" かつ language = "ja" の published 行数
```

`mapCompetitionRow` の既定値（`:162` の `publishedContentCount: 0` と同様）も 0 にする。

### 集計クエリ

`:320-323` と `:387-390` の 2 か所を、共通の内部関数 1 つに置き換える。

- **対象の大会 ID で絞る**: 先に取った `competitions` 行の `id` 一覧を使い、`.in("matches.competition_id", competitionIds)` で絞る（`!inner` 埋め込みへのフィルタ）
- **全ページを取る**: #853 で入った `loadAllPages`（`lib/db/pagination.ts`）を使う。`.range(from, to)` でページングするので、**並び順を固定する `.order("id")` を必ず付ける**（並びが不定だとページ境界で重複・欠落する）
- `select` に `content_type, language` を足し、大会 ID ごとに「全件」と「recap × ja」の 2 つを数える
- `competitionIds` が空なら DB を呼ばずに空の結果を返す
- 大会 ID が多いと URL が長くなるので、`chunkArray`（`lib/db/pagination.ts`）で 100 件ずつに分ける

呼び出し順が変わる: 現在は `competitions` と `match_content` を並列で取っているが、ID で絞るため**`competitions` の後に** `match_content` を取る。`loadReplacementCompetitions` とは並列にしてよい。

### ホーム

- `app/page.tsx:175` で `publishedContentCount: latestSeason.publishedContentCount` を詰め替えている。同じ場所で `publishedRecapCount: latestSeason.publishedRecapCount` も渡す
- `HomepageCompetitionLink`（`lib/db/queries/competitions.ts:49`）に `publishedRecapCount?: number` を追加する
- `app/page.tsx:216` の `publishedReviewCount` を `featuredCompetitionLink?.publishedRecapCount ?? 0` に変える

## UI サーフェス

表示の変化はホームの注目大会カードの数字だけ（2026-09-23 のデータなら 5本 → 2本）。ラベル「レビュー」はそのまま。

## LLM 連携

なし。

## 受け入れ条件

1. **1000 行を超えても数える**: `tests/db-queries-competitions.test.ts` で、`match_content` のモックが 1 ページ目に 1,000 行・2 ページ目に 12 行を返すとき、`publishedContentCount` の合計が **1,012** になる。**1,000 行以下のモックでは修正前も通ってしまうので、必ず 1,001 行以上で書く**
2. **ページングの呼び方**: 上の条件で `.range(0, 999)` と `.range(1000, 1999)` が呼ばれ、`.order("id")` が付いている
3. **大会で絞る**: `.in("matches.competition_id", [...])` に、その呼び出しで取った `competitions` 行の ID だけが渡る。`listSeasonsByFamilies(["six-nations", "urc"])` なら両家族の ID
4. **種類別**: recap/ja 2 行・preview/ja 3 行・recap/en 1 行を持つ大会で、`publishedContentCount` が 6、`publishedRecapCount` が 2
5. **空**: `competitions` が 0 行のとき `match_content` を呼ばない。既存テスト `does not query published content when no families are requested`（`:20`）も通る
6. **エラー**: `match_content` のどのページでも `error` が返ったら throw する（現状と同じ挙動）
7. **ホーム**: `tests/app/home-page.test.tsx:500` の「12本」は、モックで `publishedRecapCount` に与えた値が出る形に書き換える。`publishedContentCount` だけを大きくしても数字が変わらないことを assert する
8. **壊して落ちる確認**: 条件 1 のテストが、ページングを外した実装（1 回だけ取る）で落ちること、条件 4 のテストが「種類を見ずに数える」実装で落ちることを一時的に壊して確認し、PR 本文に書く（壊した変更はコミットしない）
9. `pnpm lint`・`pnpm typecheck`・`pnpm test` が通り、CI（`gh pr checks`）が緑
10. **デプロイ後の照合（Claude Code が実施）**: 本番で次の SQL の結果と、ホームのカード・大会トップ「全シーズン」の表示が一致する

```sql
select c.slug,
  count(mc.id) filter (where mc.status = 'published') as published,
  count(mc.id) filter (where mc.status = 'published' and mc.content_type = 'recap' and mc.language = 'ja') as recap_ja
from competitions c
left join matches m on m.competition_id = c.id
left join match_content mc on mc.match_id = m.id
group by 1 order by 1;
```

## 既存テストの巻き添え（実測で特定済み）

- `tests/db-queries-competitions.test.ts:33-83`: `contentQuery` のモックは `select` → `eq` で**結果を返す**形（`contentQuery.eq.mockResolvedValue`）。`.in()`・`.order()`・`.range()` を足すとチェーンが途中で切れて落ちる。モックをチェーン全体に合わせて書き直す（assert の意味は保つ）
  - 同ファイル `:95-98` の「`match_content` を 1 回だけ呼ぶ」assert は、ページングで**複数回**呼ばれうるので「大会ごとに分けて呼ばない（家族数に比例しない）」意味の assert に書き換える
  - `:131` 以降の `table === "match_content"` 分岐を持つテストも同様
- `tests/app/home-page.test.tsx:500`（上の条件 7）
- `tests/app/competition-hub-indexing.test.tsx` などで `listSeasonsByFamily` をモックしているテストは、返り値の fixture に `publishedRecapCount` が無いと型エラーになりうる。fixture に 0 を足す

## 競合とマージ順

- `specs/feat-competition-top-season-summary.md`（PR #855、Codex 実装中）は `app/c/[competition]/page.tsx` と `tests/app/competition-hub-indexing.test.tsx` を触る。本 spec はこの 2 ファイルを**fixture の型合わせ以外で触らない**
- **本 spec は #855 の実装 PR がマージされてから着手する**（`competition-hub-indexing.test.tsx` の fixture 競合を避ける）

## 本番操作

なし。

## 未解決の質問

なし（2026-09-23 Owner 承認: 別 spec 化）。

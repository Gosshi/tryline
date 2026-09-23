# Codex 指示書: 大会ごとの公開記事数が 1000 行で切れる／ホームの「レビュー◯本」がプレビューを含む

仕様書: `specs/fix-published-content-count-row-cap.md`
受け入れ条件は仕様書を正とする。ここでは繰り返さない。

`AGENTS.md` の規約に従う。仕様書と実コードが食い違ったら、実装を進めずその場で止めて Owner に確認する。

**着手条件: `specs/feat-competition-top-season-summary.md` の実装 PR がマージされてから始める。** 同じテストファイルの fixture を触るため。

## 直したいこと

`lib/db/queries/competitions.ts` の `listSeasonsByFamily`（`:320-323`）と `listSeasonsByFamilies`（`:387-390`）が、
`match_content` の published 行を**全件・並び順なし・件数指定なし**で取っている。本番は 1,012 行あり、PostgREST の 1,000 行上限で 12 行が落ちている。
加えて、ホームの注目大会カードは全種類の件数を「レビュー◯本」と表示している（2026-09-23 は 5本だが、レビューは 2 本・プレビュー 3 本）。

## 触るファイル

- `lib/db/queries/competitions.ts` — 2 か所の集計を共通の内部関数 1 つに。`CompetitionRow` と `HomepageCompetitionLink` に `publishedRecapCount`
- `app/page.tsx` — `:175` で `publishedRecapCount` を渡し、`:216` でそれを使う
- `tests/db-queries-competitions.test.ts` — モックのチェーンを書き直し、受け入れ条件 1〜6 を追加
- `tests/app/home-page.test.tsx` — `:500` の「12本」を受け入れ条件 7 の形に
- `listSeasonsByFamily` の返り値をモックしているテストの fixture（型エラーが出たものだけ `publishedRecapCount: 0` を足す）

使う既存部品: `loadAllPages`・`chunkArray`（`lib/db/pagination.ts`、#853 で追加）。新しいページング関数を作らない。

触らない:
- `app/c/[competition]/page.tsx` の「全シーズン」の出し分け条件（`publishedContentCount > 0`）
- `components/featured-competition-card.tsx`
- `app/sitemap.ts`、`app/api/v1/competitions/route.ts`

## 具体例（2026-09-23 本番）

| 大会 | published 全件 | recap × ja |
|---|---:|---:|
| `lipovitan-challenge-cup-2026` | 5 | 2 |
| `puma-trophy-2026` | 4 | （照合時に SQL で確認） |

ホームの注目大会がリポビタン D チャレンジカップ 2026 のとき、カードは「5本」→「2本」になるのが正しい。

## 処理すべきエッジケース

1. **`.range()` でページングするなら `.order("id")` を必ず付ける。** 並びが不定だとページの境界で行が重複・欠落する
2. 対象大会の ID が 0 件なら `match_content` を呼ばない
3. 大会 ID を `.in()` に渡すときは 100 件ずつに分ける（URL 長）。分けた結果は大会 ID ごとに足し合わせる
4. `matches` の埋め込みは、既存コードどおりオブジェクトの場合と配列の場合がある（`countPublishedContentByCompetition`、`:111-132`）。両方を扱う
5. どのページ・どのチャンクで `error` が返っても throw する

## テストで気をつけること

- **1,000 行以下のモックでは修正前の実装でも通ってしまう。** 受け入れ条件 1 は 1 ページ目 1,000 行＋2 ページ目 12 行で書く
- 既存の「`match_content` を 1 回だけ呼ぶ」assert（`:95-98`）は、ページングで複数回呼ばれうるので「家族の数に比例して呼ばない」意味に書き換える
- 受け入れ条件 8: ページングを外した実装・種類を見ない実装で**一時的に壊して落ちることを確認**し、PR 本文に書く（コミットしない）

## やってはいけないこと

- `publishedContentCount` の意味（全種類・全言語の公開記事数）を変えること
- Supabase の max rows 設定を変える、`.limit(10000)` 等で上限を上げてごまかすこと
- 新しいクエリ関数を別ファイルに足すこと

## 検証

- `pnpm lint`、`pnpm typecheck`、`pnpm test`
- 受け入れ条件 10（本番照合）はデプロイ後に Claude Code が行う。PR では「未実施（デプロイ後）」と書けばよい

## 完了時

- PR 本文に: 変更ファイル一覧、受け入れ条件 1〜9 それぞれの確認方法と結果、「壊して落ちた」確認の内容
- PR 作成まで。マージはしない
